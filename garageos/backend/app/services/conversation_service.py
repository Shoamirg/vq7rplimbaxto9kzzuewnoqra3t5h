"""Unified Communications Platform — the conversation service.

One service behind the Inbox. It owns the thread lifecycle (create, post a
message on any channel, change status, assign) and the read models the Inbox
needs: the work-queue lists, the queue counts, and the full thread with its
linked-entity cards + a merged **Activity** stream (messages interleaved with
the existing event/notification timeline). Every posted message emits
``MessagePosted`` — the single producer the bell, the timelines and (later)
Telegram all consume. Nothing is appended to a timeline by hand.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import noload

from app.core.events import ConversationStarted, MessagePosted
from app.exceptions import NotFoundError, UnauthorizedAction, ValidationError
from app.models.conversation import (
    _OPEN_STATUSES,
    Attachment,
    Channel,
    Conversation,
    ConvStatus,
    ConvType,
    Message,
    MessageKind,
    Participant,
    ParticipantRole,
)
from app.models.customer import Customer
from app.models.appointment import Appointment
from app.models.invoice import Invoice
from app.models.message_intent import MessageIntent
from app.models.notification import Notification
from app.models.role import Role
from app.models.operational_case import OperationalCase
from app.models.user import User
from app.models.vehicle import Vehicle
from app.repositories.inbox_query import inbox_page, safe_conversation, sla_tracking_active
from app.repositories.conversation_choices import choice_page, selected_coordinates
from app.repositories.tenant_references import local_reference, local_reference_exists
from app.repositories.unit_of_work import UnitOfWork
from app.services.case_service import CaseService
from app.services.conversation_read_service import ConversationReadService
from app.services.maintenance_service import MaintenanceService
from app.services.message_intent import FINGERPRINT_VERSION, MessageIntentConflict, MessageSubmission, fingerprint
from app.services.vehicle_health_service import _vehicle_label

# The one question a row answers: *why is this still open?*
STATUS_LABEL = {
    ConvStatus.OPEN: "Waiting on dispatcher",
    ConvStatus.WAITING_CUSTOMER: "Waiting on customer",
    ConvStatus.WAITING_TECHNICIAN: "Waiting on technician",
    ConvStatus.WAITING_APPROVAL: "Waiting on approval",
    ConvStatus.SNOOZED: "Snoozed",
    ConvStatus.RESOLVED: "Resolved",
}



class ConversationNotFound(NotFoundError):
    def __init__(self):
        super().__init__("Conversation not found")


class CaseConversationUnavailable(UnauthorizedAction):
    code = "CASE_CONVERSATION_UNAVAILABLE"
    detail = "This case conversation has not been started"


class ConversationReferenceMismatch(ValidationError):
    detail = "Selected conversation references do not belong together"


class ConversationService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id
        self.maintenance = MaintenanceService(uow.session, self.sc)

    # ── fetch ─────────────────────────────────────────────────
    async def list_choices(self, *, kind, q, limit, offset, **context) -> dict:
        coordinates = await selected_coordinates(self.session, self.sc, context)
        if coordinates is None:
            raise ConversationNotFound()
        customers, vehicles = coordinates
        if len(customers) > 1 or len(vehicles) > 1:
            raise ConversationReferenceMismatch()
        return await choice_page(self.session, self.sc, kind=kind, q=q, limit=limit,
                                 offset=offset, customer=next(iter(customers), None),
                                 vehicle=next(iter(vehicles), None))

    async def _get(self, conversation_id: uuid.UUID, *, for_update: bool = False) -> Conversation:
        statement = select(Conversation).where(
                Conversation.id == conversation_id,
                *safe_conversation(self.sc),
            ).options(noload(Conversation.messages), noload(Conversation.participants))
        if for_update:
            statement = statement.with_for_update(of=Conversation).execution_options(populate_existing=True)
        row = await self.session.execute(statement)
        conv = row.scalar_one_or_none()
        if not conv:
            raise ConversationNotFound()
        if for_update:
            # A foreign child/reference can commit while the initial statement
            # waits on an existing FK/row lock. Recheck under a fresh statement
            # snapshot after acquisition; this transaction already owns the row.
            safe = await self.session.scalar(select(Conversation.id).where(
                Conversation.id == conv.id, *safe_conversation(self.sc)))
            if safe is None:
                raise ConversationNotFound()
        return conv

    # ── create ────────────────────────────────────────────────
    async def create_conversation(
        self, *, subject: str | None = None, conv_type: str = ConvType.GENERAL,
        priority: str = "medium", customer_id: uuid.UUID | None = None,
        vehicle_id: uuid.UUID | None = None, appointment_id: uuid.UUID | None = None,
        case_id: uuid.UUID | None = None, invoice_id: uuid.UUID | None = None,
        assigned_user_id: uuid.UUID | None = None, ai_summary: str | None = None,
        pinned_notes: list | None = None, participants: list[dict] | None = None,
        _recorded_context: bool = False,
    ) -> dict:
        # Only owning-model entry points may preserve an existing inactive or
        # transferred snapshot when starting its first thread. Public creation
        # always chooses currently eligible references.
        await self._validate_creation_references(
            customer_id=customer_id, vehicle_id=vehicle_id, appointment_id=appointment_id,
            case_id=case_id, invoice_id=invoice_id, assigned_user_id=assigned_user_id,
            participants=participants or [], recorded_context=_recorded_context,
        )
        now = datetime.now(timezone.utc)
        conv = Conversation(
            service_center_id=self.sc, subject=subject, conv_type=conv_type,
            status=ConvStatus.OPEN, priority=priority, customer_id=customer_id,
            vehicle_id=vehicle_id, appointment_id=appointment_id, case_id=case_id,
            invoice_id=invoice_id, assigned_user_id=assigned_user_id,
            ai_summary=ai_summary, pinned_notes=pinned_notes, last_activity_at=now,
            summary_version=1 if ai_summary else 0,
            summary_updated_at=now if ai_summary else None,
        )
        self.session.add(conv)
        await self.session.flush()

        # Seed participants — the customer (if any) is implicit unless overridden.
        seeds = participants if participants is not None else self._default_participants(customer_id)
        for p in seeds:
            self.session.add(Participant(
                service_center_id=self.sc, conversation_id=conv.id,
                role=p.get("role", ParticipantRole.CUSTOMER), display_name=p["display_name"],
                user_id=p.get("user_id"), customer_id=p.get("customer_id"),
            ))
        await self.session.flush()

        self.uow.add_event(ConversationStarted(
            service_center_id=self.sc, conversation_id=conv.id, conv_type=conv_type,
            subject=subject, customer_id=customer_id, vehicle_id=vehicle_id, case_id=case_id,
        ))
        return await self.serialize_row(conv)

    async def find_or_create_customer_thread(
        self, *, customer_id: uuid.UUID, display_name: str
    ) -> uuid.UUID:
        """The customer's live conversation for inbound channel messages.

        Reuses their most recent still-open thread so a Telegram chat stays one
        continuous conversation instead of spawning a new inbox row per message;
        only opens a fresh one when nothing is open. Returns the conversation id.
        """
        stmt = (
            select(Conversation)
            .where(
                *safe_conversation(self.sc),
                Conversation.customer_id == customer_id,
                Conversation.status.in_(tuple(_OPEN_STATUSES)),
            )
            .order_by(Conversation.last_activity_at.desc().nullslast())
            .limit(1)
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return existing.id

        created = await self.create_conversation(
            subject=display_name,
            conv_type=ConvType.GENERAL,
            customer_id=customer_id,
            participants=[{
                "role": ParticipantRole.CUSTOMER,
                "display_name": display_name,
                "customer_id": customer_id,
            }],
        )
        return uuid.UUID(created["id"])

    def _default_participants(self, customer_id: uuid.UUID | None) -> list[dict]:
        return []

    async def _eligible_staff(self, user_id: uuid.UUID) -> User:
        user = await self.session.scalar(select(User).join(Role).where(
            User.id == user_id, User.service_center_id == self.sc,
            User.is_active.is_(True), Role.is_active.is_(True),
            Role.name.in_(['admin', 'manager', 'receptionist', 'mechanic', 'super_admin']),
        ).with_for_update(read=True, of=(User, Role)).execution_options(populate_existing=True))
        if user is None:
            raise ConversationNotFound()
        return user

    async def _validate_creation_references(self, *, customer_id, vehicle_id,
            appointment_id, case_id, invoice_id, assigned_user_id, participants, recorded_context):
        if recorded_context and not any([appointment_id, case_id, invoice_id]):
            raise ValueError('A recorded context requires its owning record')
        customers = {customer_id} if customer_id is not None else set()
        vehicles = {vehicle_id} if vehicle_id is not None else set()
        for model, reference in [(Customer, customer_id), (Vehicle, vehicle_id)]:
            if reference is not None and await local_reference(
                    self.session, model, reference, self.sc, active=not recorded_context) is None:
                raise ConversationNotFound()
        if vehicle_id is not None:
            vehicle = await local_reference(self.session, Vehicle, vehicle_id, self.sc)
            if await local_reference(self.session, Customer, vehicle.customer_id, self.sc) is None:
                raise ConversationNotFound()
            if not recorded_context and customer_id is not None and vehicle.customer_id != customer_id:
                raise ConversationReferenceMismatch()
            if not recorded_context:
                customers.add(vehicle.customer_id)
        if assigned_user_id is not None:
            await self._eligible_staff(assigned_user_id)
        for model, reference in [(Appointment, appointment_id), (OperationalCase, case_id), (Invoice, invoice_id)]:
            if reference is None:
                continue
            linked = await local_reference(self.session, model, reference, self.sc, active=True)
            if linked is None:
                raise ConversationNotFound()
            for child_model, child in [(Customer, linked.customer_id), (Vehicle, linked.vehicle_id)]:
                if child is not None:
                    child_record = await local_reference(self.session, child_model, child, self.sc)
                    if child_record is None:
                        raise ConversationNotFound()
                    if child_model is Vehicle and await local_reference(
                            self.session, Customer, child_record.customer_id, self.sc) is None:
                        raise ConversationNotFound()
            if model is OperationalCase and linked.assigned_user_id is not None:
                if await local_reference(self.session, User, linked.assigned_user_id, self.sc) is None:
                    raise ConversationNotFound()
            if linked.customer_id is not None:
                customers.add(linked.customer_id)
            if linked.vehicle_id is not None:
                vehicles.add(linked.vehicle_id)
        if len(customers) > 1 or len(vehicles) > 1:
            raise ConversationReferenceMismatch()
        for participant in participants:
            if participant.get('user_id') is not None:
                await self._eligible_staff(participant['user_id'])
            if participant.get('customer_id') is not None and await local_reference(
                    self.session, Customer, participant['customer_id'], self.sc, active=not recorded_context) is None:
                raise ConversationNotFound()

    # ── post a message (any channel) ──────────────────────────
    async def post_message(
        self, conversation_id: uuid.UUID, *, body: str | None = None,
        channel: str = Channel.WEB, author_role: str = ParticipantRole.DISPATCHER,
        author_name: str | None = None, author_user_id: uuid.UUID | None = None,
        kind: str = MessageKind.TEXT, is_internal: bool = False,
        mentions: list | None = None, attachments: list[dict] | None = None,
        submission: MessageSubmission | None = None,
        customer_actor_id: uuid.UUID | None = None,
    ) -> dict:
        # Hold the aggregate lock until the normal UoW commits or rolls back.
        # Refresh previously loaded customer-owned rows after lock acquisition:
        # parallel distinct intents must not increment a stale unread counter.
        # The initial lock statement can wait while a linked record changes.
        # Reuse the aggregate guard's fresh post-lock owning-reference snapshot
        # before any legacy/keyed staff or customer replay/effect.
        conv = await self._get(conversation_id, for_update=True)
        # Customer ownership is an authorization boundary even when a legacy
        # caller omits a key. Recheck the freshly locked row, not a pre-lock
        # CustomerPortalService read that could precede an ownership transfer.
        if customer_actor_id is not None:
            customer = await local_reference(self.session, Customer, customer_actor_id, self.sc, active=True)
            if customer is None or conv.customer_id != customer_actor_id:
                raise ConversationNotFound()
        await self._validate_message_target(conv)
        internal = is_internal or kind == MessageKind.NOTE
        effective_channel = Channel.INTERNAL if internal else channel
        content_hash = None
        if submission is not None:
            if submission.actor_kind == "customer":
                if conv.customer_id != submission.actor_id:
                    raise ConversationNotFound()
                actor = await local_reference(self.session, Customer, submission.actor_id, self.sc, active=True)
            elif submission.actor_kind == "staff":
                actor = await local_reference(self.session, User, submission.actor_id, self.sc, active=True)
            else:
                raise ValueError("Message submission requires an authenticated actor namespace")
            if actor is None:
                raise ConversationNotFound()
            content_hash = fingerprint(
                submission=submission, body=body, kind=kind, channel=effective_channel,
                internal=internal, author_role=author_role, mentions=mentions, attachments=attachments,
            )
            saved = await self.session.scalar(select(MessageIntent).where(
                MessageIntent.service_center_id == self.sc, MessageIntent.conversation_id == conv.id,
                MessageIntent.actor_kind == submission.actor_kind, MessageIntent.actor_id == submission.actor_id,
                MessageIntent.key == submission.key,
            ))
            if saved is not None:
                # Validate before comparing/returning a receipt. A bad legacy
                # ledger edge must never turn into a new intent or cached leak.
                linked_message = await self.session.scalar(select(Message.id).where(
                    Message.id == saved.message_id, Message.service_center_id == self.sc,
                    Message.conversation_id == conv.id,
                ))
                if linked_message is None:
                    raise ConversationNotFound()
                if saved.fingerprint_version != FINGERPRINT_VERSION or saved.fingerprint != content_hash:
                    raise MessageIntentConflict()
                return dict(saved.response)
        msg = Message(
            service_center_id=self.sc, conversation_id=conv.id, kind=kind,
            channel=effective_channel, is_internal=internal,
            author_role=author_role, author_name=author_name, author_user_id=author_user_id,
            body=body, mentions=mentions or None,
        )
        self.session.add(msg)
        await self.session.flush()

        created_atts: list[Attachment] = []
        for a in attachments or []:
            att = Attachment(
                service_center_id=self.sc, message_id=msg.id, conversation_id=conv.id,
                kind=a.get("kind", "photo"), label=a["label"], url=a.get("url"), meta=a.get("meta"),
            )
            self.session.add(att)
            created_atts.append(att)

        # Keep the denormalised inbox-row fields current.
        now = msg.created_at or datetime.now(timezone.utc)
        preview = body or (attachments[0]["label"] if attachments else None)
        conv.last_message_at = now
        conv.last_activity_at = now
        conv.last_message_preview = (preview or "")[:300] or None
        conv.last_channel = msg.channel
        conv.last_sender_role = author_role
        inbound = author_role == ParticipantRole.CUSTOMER
        if inbound and not internal:
            conv.message_generation += 1
            conv.unread_messages = conv.message_generation - conv.acknowledged_message_generation
            if conv.status in (ConvStatus.WAITING_CUSTOMER, ConvStatus.SNOOZED):
                conv.status = ConvStatus.OPEN  # ball's back in our court
        await self.session.flush()

        response = self._msg_dict(msg, created_atts)
        if submission is not None:
            self.session.add(MessageIntent(
                service_center_id=self.sc, conversation_id=conv.id,
                actor_kind=submission.actor_kind, actor_id=submission.actor_id, key=submission.key,
                fingerprint_version=FINGERPRINT_VERSION, fingerprint=content_hash,
                message_id=msg.id, response=response,
            ))
            await self.session.flush()

        self.uow.add_event(MessagePosted(
            service_center_id=self.sc, conversation_id=conv.id, message_id=msg.id,
            channel=msg.channel, author_role=author_role, author_name=author_name,
            is_internal=internal, preview=preview, mentions=mentions or None,
            customer_id=conv.customer_id, vehicle_id=conv.vehicle_id, case_id=conv.case_id,
        ))
        return response

    async def _validate_message_target(self, conv: Conversation) -> None:
        """Validate write/replay entry without certifying unrelated Inbox CRUD.

        Local inactive historical customer/vehicle/user links remain valid.
        Optional links may be absent. Vehicle ownership can change after an
        appointment/case: keep its captured customer instead of rewriting it.
        """
        await self._validate_case_thread(conv)
        if conv.case_id is not None:
            case = await CaseService(self.uow).get_record(conv.case_id)
            if ((conv.customer_id is not None and case.customer_id is not None and case.customer_id != conv.customer_id)
                    or (conv.vehicle_id is not None and case.vehicle_id is not None and case.vehicle_id != conv.vehicle_id)):
                raise ConversationNotFound()
        for model, reference in [(Appointment, conv.appointment_id), (Invoice, conv.invoice_id)]:
            if reference is None:
                continue
            linked = await local_reference(self.session, model, reference, self.sc)
            if (linked is None or (conv.customer_id is not None and linked.customer_id is not None and linked.customer_id != conv.customer_id)
                    or (conv.vehicle_id is not None and linked.vehicle_id is not None and linked.vehicle_id != conv.vehicle_id)):
                raise ConversationNotFound()
            # Owning snapshots can keep an inactive/transferred local vehicle,
            # but cannot point outside the authenticated center.
            for child_model, child_id in [(Customer, linked.customer_id), (Vehicle, linked.vehicle_id)]:
                if child_id is not None and await local_reference(self.session, child_model, child_id, self.sc) is None:
                    raise ConversationNotFound()

    # ── transitions ───────────────────────────────────────────
    async def set_status(self, conversation_id: uuid.UUID, status: str) -> dict:
        return await self.update_conversation(conversation_id, status=status)

    async def assign(self, conversation_id: uuid.UUID, user_id: uuid.UUID | None) -> dict:
        return await self.update_conversation(conversation_id, assigned_user_id=user_id, assignment_supplied=True)

    async def update_conversation(self, conversation_id: uuid.UUID, *, status: str | None = None,
            assigned_user_id: uuid.UUID | None = None, assignment_supplied: bool = False,
            mark_read: bool = False, read_observation: uuid.UUID | None = None,
            actor_id: uuid.UUID | None = None) -> dict:
        conv = await self._get(conversation_id, for_update=True)
        if status is not None and status not in {
                ConvStatus.OPEN, ConvStatus.WAITING_CUSTOMER, ConvStatus.WAITING_TECHNICIAN,
                ConvStatus.WAITING_APPROVAL, ConvStatus.SNOOZED, ConvStatus.RESOLVED}:
            raise ConversationReferenceMismatch()
        if assignment_supplied and assigned_user_id is not None:
            await self._eligible_staff(assigned_user_id)
        reads = ConversationReadService(self.uow)
        if actor_id is not None:
            await reads._actor(actor_id, "staff.write")
        observation = await reads.validate(conv, read_observation, actor_id) if mark_read else None
        changed = ((status is not None and status != conv.status)
            or (assignment_supplied and assigned_user_id != conv.assigned_user_id))
        if status is not None:
            conv.status = status
        if assignment_supplied:
            conv.assigned_user_id = assigned_user_id
        if changed:
            self._bump_activity(conv)
        if observation is not None:
            reads.acknowledge(conv, observation)
        await self.session.flush()
        return await self.serialize_row(conv)

    async def mark_read(self, conversation_id: uuid.UUID, *, read_observation: uuid.UUID,
            actor_id: uuid.UUID) -> dict:
        return await self.update_conversation(conversation_id, mark_read=True,
            read_observation=read_observation, actor_id=actor_id)

    def _bump_activity(self, conv: Conversation) -> None:
        """Non-message work (assignment, status change, linked events) still
        floats the thread up and registers as unread activity."""
        conv.last_activity_at = datetime.now(timezone.utc)
        conv.activity_generation += 1
        conv.unread_activity = conv.activity_generation - conv.acknowledged_activity_generation

    async def follow(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID, display_name: str) -> dict:
        conv = await self._get(conversation_id, for_update=True)
        await ConversationReadService(self.uow)._actor(user_id, "staff.write")
        existing = list(await self.session.scalars(
            select(Participant).where(
                Participant.service_center_id == self.sc,
                Participant.conversation_id == conv.id, Participant.user_id == user_id)
        ))
        if existing:
            for participant in existing:
                participant.is_following = True
        else:
            self.session.add(Participant(
                service_center_id=self.sc, conversation_id=conv.id,
                role=ParticipantRole.WATCHER, display_name=display_name,
                user_id=user_id, is_following=True))
        await self.session.flush()
        return {"conversation_id": str(conv.id), "following": True}

    async def unfollow(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID) -> dict:
        conv = await self._get(conversation_id, for_update=True)
        await ConversationReadService(self.uow)._actor(user_id, "staff.write")
        existing = list(await self.session.scalars(
            select(Participant).where(
                Participant.service_center_id == self.sc,
                Participant.conversation_id == conv.id, Participant.user_id == user_id)
        ))
        for participant in existing:
            participant.is_following = False
        await self.session.flush()
        return {"conversation_id": str(conv.id), "following": False}

    # ── shared model: the conversation for an operational case ─
    _CASE_TO_CONV = {
        "emergency": ConvType.EMERGENCY, "support": ConvType.SUPPORT,
        "warranty": ConvType.WARRANTY, "vip": ConvType.VIP, "towing": ConvType.GENERAL,
    }
    _SEV_TO_PRIORITY = {"critical": "high", "high": "high", "medium": "medium", "low": "low"}

    async def get_or_create_for_case(self, case_id: uuid.UUID, *, allow_create: bool = True,
            user_id: uuid.UUID | None = None, observe_read: bool = False) -> dict:
        """Return the thread for a dispatch case, creating it on first open.

        This is the proof that Operations and the Inbox are ONE system: a case's
        communication is a normal Conversation, linked by ``case_id``.
        """
        # GET creates a persisted aggregate on first open. Serialize creators on
        # the already tenant/reference-validated case row until the UoW commits;
        # concurrent first opens must not split messages into separate threads.
        case = await CaseService(self.uow).get_record(case_id, for_update=allow_create)
        existing = (await self.session.execute(
            select(Conversation).where(
                Conversation.service_center_id == self.sc,
                Conversation.case_id == case_id,
                Conversation.is_active.is_(True),
            ).order_by(Conversation.created_at, Conversation.id).limit(1)
        )).scalar_one_or_none()
        if existing:
            await self._validate_case_thread(existing)
            return await self.get_thread(existing.id, user_id=user_id, observe_read=observe_read)

        if not allow_create:
            raise CaseConversationUnavailable()

        customer = await local_reference(self.session, Customer, case.customer_id, self.sc)
        parts = [{"role": ParticipantRole.CUSTOMER,
                  "display_name": customer.full_name if customer else "Customer",
                  "customer_id": case.customer_id}]
        created = await self.create_conversation(
            subject=case.title, conv_type=self._CASE_TO_CONV.get(case.case_type, ConvType.GENERAL),
            priority=self._SEV_TO_PRIORITY.get(case.severity, "medium"),
            customer_id=case.customer_id, vehicle_id=case.vehicle_id, case_id=case.id,
            ai_summary=None, participants=parts,
            _recorded_context=True,
        )
        # An opening system line so the thread isn't blank (author=system → no bell).
        await self.post_message(
            uuid.UUID(created["id"]),
            body=f"Case {case.code} opened · {case.title}",
            channel=case.channel or Channel.WEB, author_role=ParticipantRole.SYSTEM,
            author_name="System",
        )
        return await self.get_thread(uuid.UUID(created["id"]), user_id=user_id, observe_read=observe_read)

    async def _validate_case_thread(self, conv: Conversation) -> None:
        """Reject a legacy aggregate with foreign or inconsistent references.

        This guard belongs to the case entry point. It does not certify the
        unrelated general Inbox entry points or rewrite historical snapshots.
        """
        local_links = [or_(reference.is_(None), local_reference_exists(model, reference, self.sc))
                       for model, reference in [(Customer, Conversation.customer_id),
                                                (Vehicle, Conversation.vehicle_id),
                                                (User, Conversation.assigned_user_id)]]
        safe = await self.session.scalar(select(Conversation.id).where(
            Conversation.id == conv.id, Conversation.service_center_id == self.sc, *local_links))
        if safe is None:
            raise ConversationNotFound()

        bad_participant = await self.session.scalar(select(Participant.id).where(
            Participant.conversation_id == conv.id,
            or_(Participant.service_center_id != self.sc,
                ~or_(Participant.customer_id.is_(None), local_reference_exists(Customer, Participant.customer_id, self.sc)),
                ~or_(Participant.user_id.is_(None), local_reference_exists(User, Participant.user_id, self.sc))),
        ).limit(1))
        bad_message = await self.session.scalar(select(Message.id).where(
            Message.conversation_id == conv.id,
            or_(Message.service_center_id != self.sc,
                ~or_(Message.author_user_id.is_(None), local_reference_exists(User, Message.author_user_id, self.sc))),
        ).limit(1))
        # Include outgoing AND incoming edges: a message in this thread must
        # not carry an attachment whose conversation points somewhere else.
        bad_attachment = await self.session.scalar(select(Attachment.id).outerjoin(
            Message, Attachment.message_id == Message.id,
        ).where(
            or_(Attachment.conversation_id == conv.id, Message.conversation_id == conv.id),
            or_(Attachment.service_center_id != self.sc, Message.id.is_(None),
                Message.service_center_id != self.sc, Attachment.conversation_id != Message.conversation_id),
        ).limit(1))
        if bad_participant is not None or bad_message is not None or bad_attachment is not None:
            raise ConversationNotFound()

    # ── inbox (work queues) ───────────────────────────────────
    async def list_inbox(
        self, *, view: str = "needs_reply", channel: str | None = None,
        conv_type: str | None = None, user_id: uuid.UUID | None = None,
        q: str | None = None, limit: int = 80, offset: int = 0,
    ) -> dict:
        result = await inbox_page(self.session, self.sc, view=view, channel=channel,
            conv_type=conv_type, user_id=user_id, q=q, limit=limit, offset=offset)
        # Retain the legacy API label until each consumer localizes raw status.
        for item in result["items"]:
            item["status_label"] = STATUS_LABEL.get(item["status"], item["status"])
        return result

    # ── thread detail ─────────────────────────────────────────
    async def get_thread(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID | None = None,
            observe_read: bool = False) -> dict:
        conv = await self._get(conversation_id, for_update=observe_read)
        data = await self.serialize_row(conv, full=True)

        msgs = list((await self.session.execute(
            select(Message).where(Message.conversation_id == conv.id, Message.service_center_id == self.sc)
            .order_by(Message.created_at.asc(), Message.id.asc()).options(noload(Message.attachments))
        )).scalars().all())
        atts_by_msg = await self._attachments_for(conv.id)
        data["messages"] = [self._msg_dict(m, atts_by_msg.get(m.id, [])) for m in msgs]

        parts = list((await self.session.execute(
            select(Participant).where(Participant.conversation_id == conv.id, Participant.service_center_id == self.sc)
            .order_by(Participant.created_at, Participant.id)
        )).scalars().all())
        data["participants"] = [
            {"id": str(p.id), "role": p.role, "display_name": p.display_name,
             "is_online": p.is_online, "is_typing": p.is_typing,
             "is_following": p.is_following, "active_channel": p.active_channel}
            for p in parts]
        # Is the current user Following this thread (even if unassigned)?
        data["is_following"] = any(
            p.user_id == user_id and p.is_following
            for p in parts) if user_id else False
        data["followers"] = len({p.user_id for p in parts if p.is_following and p.user_id is not None})

        data["activity"] = await self._activity(conv, data["messages"])
        data["pinned_notes"] = conv.pinned_notes or []
        if observe_read:
            if user_id is None:
                raise UnauthorizedAction()
            data["read_observation"] = await ConversationReadService(self.uow).issue(conv, user_id)
        return data

    async def _attachments_for(self, conversation_id: uuid.UUID) -> dict:
        rows = list((await self.session.execute(
            select(Attachment).where(Attachment.conversation_id == conversation_id, Attachment.service_center_id == self.sc)
            .order_by(Attachment.created_at, Attachment.id)
        )).scalars().all())
        out: dict[uuid.UUID, list] = {}
        for a in rows:
            out.setdefault(a.message_id, []).append(a)
        return out

    async def _activity(self, conv: Conversation, messages: list[dict]) -> list:
        """Merge human messages with the event stream (notifications linked to
        this conversation or its linked entities) into one time-ordered feed."""
        ors = [Notification.entity_id == conv.id]
        if conv.case_id:
            ors.append(Notification.entity_id == conv.case_id)
        if conv.vehicle_id:
            ors.append(Notification.vehicle_id == conv.vehicle_id)
        events = list((await self.session.execute(
            select(Notification).where(
                Notification.service_center_id == self.sc, or_(*ors),
            ).order_by(Notification.created_at, Notification.id)
        )).scalars().all())

        feed = [{"id": str(n.id), "type": "event", "title": n.title, "detail": n.body,
                 "date": n.created_at.isoformat(), "severity": n.severity,
                 "category": n.category} for n in events]
        feed += [{"id": m["id"], "type": "message", "title": m["author_name"] or m["author_role"],
                  "detail": m["body"], "date": m["created_at"], "severity": "info",
                  "author_role": m["author_role"], "channel": m["channel"]} for m in messages]
        feed.sort(key=lambda x: (x["date"] or "", x["id"], x["type"]))
        return feed

    # ── serialization ─────────────────────────────────────────
    def _msg_dict(self, m: Message, attachments: list) -> dict:
        return {
            "id": str(m.id), "kind": m.kind, "channel": m.channel,
            "is_internal": m.is_internal, "author_role": m.author_role,
            "author_name": m.author_name, "body": m.body,
            "delivery_status": m.delivery_status, "mentions": m.mentions or [],
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "attachments": [
                {"id": str(a.id), "kind": a.kind, "label": a.label, "url": a.url, "meta": a.meta}
                for a in attachments],
        }

    async def serialize_row(self, conv: Conversation, full: bool = False) -> dict:
        out = {
            "id": str(conv.id), "subject": conv.subject, "conv_type": conv.conv_type,
            "status": conv.status, "status_label": STATUS_LABEL.get(conv.status, conv.status),
            "priority": conv.priority, "last_channel": conv.last_channel,
            "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
            "last_activity_at": conv.last_activity_at.isoformat() if conv.last_activity_at else None,
            "last_message_preview": conv.last_message_preview,
            "last_sender_role": conv.last_sender_role,
            "unread_messages": conv.unread_messages or 0,
            "unread_activity": conv.unread_activity or 0,
            "ai_summary": conv.ai_summary,
            "is_open": conv.is_open(),
            "assigned_user_id": str(conv.assigned_user_id) if conv.assigned_user_id else None,
            "customer_id": str(conv.customer_id) if conv.customer_id else None,
            "vehicle_id": str(conv.vehicle_id) if conv.vehicle_id else None,
            "appointment_id": str(conv.appointment_id) if conv.appointment_id else None,
            "case_id": str(conv.case_id) if conv.case_id else None,
            "invoice_id": str(conv.invoice_id) if conv.invoice_id else None,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
        }
        # Lightweight labels every row needs.
        if conv.customer_id:
            cust = await local_reference(self.session, Customer, conv.customer_id, self.sc)
            out["customer_name"] = cust.full_name if cust else None
            out["customer_phone"] = cust.phone if cust else None
        if conv.vehicle_id:
            vehicle = await self.maintenance.vehicle_repo.get_with_model(conv.vehicle_id)
            out["vehicle_label"] = _vehicle_label(vehicle) if vehicle else None
        if conv.assigned_user_id:
            u = await local_reference(self.session, User, conv.assigned_user_id, self.sc)
            out["assigned_name"] = u.full_name if u else None
        if conv.case_id:
            case = await local_reference(self.session, OperationalCase, conv.case_id, self.sc)
            if case:
                elapsed = int((datetime.now(timezone.utc) - _utc(case.created_at)).total_seconds())
                out["case_code"] = case.code
                out["case_status"] = case.status
                tracking = sla_tracking_active(conv.status, case.status, case.is_active)
                out["sla_tracking_active"] = tracking
                out["sla_elapsed_seconds"] = elapsed
                out["sla_response_minutes"] = case.sla_response_minutes
                out["sla_breached"] = tracking and elapsed > case.sla_response_minutes * 60

        if full:
            out["linked"] = await self._linked_cards(conv)
        return out

    async def _linked_cards(self, conv: Conversation) -> list:
        """The context-sidebar cards — only present links appear."""
        cards: list[dict] = []
        if conv.case_id:
            case = await local_reference(self.session, OperationalCase, conv.case_id, self.sc)
            if case:
                cards.append({"kind": "case", "title": case.code, "case_type": case.case_type,
                              "subtitle": case.status,
                              "available": bool(case.is_active),
                              "link": f"/operations?case={case.id}" if case.is_active else None})
        if conv.appointment_id:
            appointment = await local_reference(self.session, Appointment, conv.appointment_id, self.sc, active=True)
            if appointment:
                from app.core.timezone import local_date_for_instant, service_center_timezone

                zone_name = await service_center_timezone(self.session, self.sc)
                cards.append({"kind": "appointment", "title": None, "subtitle": appointment.status,
                    "appointment_date": appointment.appointment_date.isoformat(),
                    "appointment_local_date": local_date_for_instant(appointment.appointment_date, zone_name).isoformat(),
                    "appointment_time": appointment.appointment_time,
                    "link": f"/appointments/{appointment.id}"})
            else:
                cards.append({"kind": "appointment", "title": None, "subtitle": None, "link": None, "available": False})
        if conv.invoice_id:
            invoice = await local_reference(self.session, Invoice, conv.invoice_id, self.sc, active=True)
            if invoice:
                cards.append({"kind": "invoice", "title": invoice.code, "subtitle": invoice.status,
                    "invoice_kind": invoice.kind, "link": f"/invoice/{invoice.id}"})
            else:
                cards.append({"kind": "invoice", "title": None, "subtitle": None, "link": None, "available": False})
        if conv.vehicle_id:
            vehicle = await self.maintenance.vehicle_repo.get_with_model(conv.vehicle_id)
            if vehicle:
                cards.append({"kind": "vehicle", "title": _vehicle_label(vehicle),
                              "subtitle": None,
                              "link": f"/vehicles/{conv.vehicle_id}"})
                cards.append({"kind": "passport", "title": None,
                              "subtitle": None, "link": f"/passport/{conv.vehicle_id}"})
            else:
                # Keep the historical edge visible without inventing health or
                # advertising a public passport URL that now returns 404.
                cards.append({"kind": "vehicle", "title": None, "subtitle": None,
                              "link": None, "available": False})
        if conv.customer_id:
            cust = await local_reference(self.session, Customer, conv.customer_id, self.sc)
            if cust:
                cards.append({"kind": "customer", "title": cust.full_name,
                              "subtitle": "Customer 360", "phone": cust.phone,
                              "available": bool(cust.is_active),
                              "link": f"/customers/{cust.id}" if cust.is_active else None})
        return cards


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
