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

from sqlalchemy import func, or_, select

from app.core.events import ConversationStarted, MessagePosted
from app.exceptions import NotFoundError, UnauthorizedAction
from app.models.conversation import (
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
from app.models.notification import Notification
from app.models.operational_case import OperationalCase
from app.models.user import User
from app.models.vehicle import Vehicle
from app.repositories.tenant_references import local_reference, local_reference_exists
from app.repositories.unit_of_work import UnitOfWork
from app.services.case_service import CaseService
from app.services.maintenance_service import MaintenanceService
from app.services.vehicle_health_service import _band, _vehicle_label

# The one question a row answers: *why is this still open?*
STATUS_LABEL = {
    ConvStatus.OPEN: "Waiting on dispatcher",
    ConvStatus.WAITING_CUSTOMER: "Waiting on customer",
    ConvStatus.WAITING_TECHNICIAN: "Waiting on technician",
    ConvStatus.WAITING_APPROVAL: "Waiting on approval",
    ConvStatus.SNOOZED: "Snoozed",
    ConvStatus.RESOLVED: "Resolved",
}
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}

# The work-queue views, in rail order. Each maps to a predicate below.
VIEWS = [
    "needs_reply", "assigned_me", "mentions", "waiting_customer",
    "waiting_technician", "waiting_approval", "sla_breached", "unread", "resolved",
]


class ConversationNotFound(NotFoundError):
    def __init__(self):
        super().__init__("Conversation not found")


class CaseConversationUnavailable(UnauthorizedAction):
    code = "CASE_CONVERSATION_UNAVAILABLE"
    detail = "This case conversation has not been started"


class ConversationService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id
        self.maintenance = MaintenanceService(uow.session, self.sc)

    # ── fetch ─────────────────────────────────────────────────
    async def _get(self, conversation_id: uuid.UUID) -> Conversation:
        row = await self.session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.service_center_id == self.sc,
                Conversation.is_active.is_(True),
            )
        )
        conv = row.scalar_one_or_none()
        if not conv:
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
    ) -> dict:
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

    def _default_participants(self, customer_id: uuid.UUID | None) -> list[dict]:
        return []

    # ── post a message (any channel) ──────────────────────────
    async def post_message(
        self, conversation_id: uuid.UUID, *, body: str | None = None,
        channel: str = Channel.WEB, author_role: str = ParticipantRole.DISPATCHER,
        author_name: str | None = None, author_user_id: uuid.UUID | None = None,
        kind: str = MessageKind.TEXT, is_internal: bool = False,
        mentions: list | None = None, attachments: list[dict] | None = None,
    ) -> dict:
        conv = await self._get(conversation_id)
        internal = is_internal or kind == MessageKind.NOTE
        msg = Message(
            service_center_id=self.sc, conversation_id=conv.id, kind=kind,
            channel=Channel.INTERNAL if internal else channel, is_internal=internal,
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
            conv.unread_messages = (conv.unread_messages or 0) + 1
            if conv.status in (ConvStatus.WAITING_CUSTOMER, ConvStatus.SNOOZED):
                conv.status = ConvStatus.OPEN  # ball's back in our court
        await self.session.flush()

        self.uow.add_event(MessagePosted(
            service_center_id=self.sc, conversation_id=conv.id, message_id=msg.id,
            channel=msg.channel, author_role=author_role, author_name=author_name,
            is_internal=internal, preview=preview, mentions=mentions or None,
            customer_id=conv.customer_id, vehicle_id=conv.vehicle_id, case_id=conv.case_id,
        ))
        return self._msg_dict(msg, created_atts)

    # ── transitions ───────────────────────────────────────────
    async def set_status(self, conversation_id: uuid.UUID, status: str) -> dict:
        conv = await self._get(conversation_id)
        conv.status = status
        self._bump_activity(conv)
        await self.session.flush()
        return await self.serialize_row(conv)

    async def assign(self, conversation_id: uuid.UUID, user_id: uuid.UUID | None) -> dict:
        conv = await self._get(conversation_id)
        conv.assigned_user_id = user_id
        self._bump_activity(conv)
        await self.session.flush()
        return await self.serialize_row(conv)

    async def mark_read(self, conversation_id: uuid.UUID) -> dict:
        conv = await self._get(conversation_id)
        conv.unread_messages = 0
        conv.unread_activity = 0
        await self.session.flush()
        return await self.serialize_row(conv)

    def _bump_activity(self, conv: Conversation) -> None:
        """Non-message work (assignment, status change, linked events) still
        floats the thread up and registers as unread activity."""
        conv.last_activity_at = datetime.now(timezone.utc)
        conv.unread_activity = (conv.unread_activity or 0) + 1

    async def follow(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID, display_name: str) -> dict:
        conv = await self._get(conversation_id)
        existing = (await self.session.execute(
            select(Participant).where(
                Participant.conversation_id == conv.id, Participant.user_id == user_id)
        )).scalar_one_or_none()
        if existing:
            existing.is_following = True
        else:
            self.session.add(Participant(
                service_center_id=self.sc, conversation_id=conv.id,
                role=ParticipantRole.WATCHER, display_name=display_name,
                user_id=user_id, is_following=True))
        await self.session.flush()
        return {"conversation_id": str(conv.id), "following": True}

    async def unfollow(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID) -> dict:
        conv = await self._get(conversation_id)
        existing = (await self.session.execute(
            select(Participant).where(
                Participant.conversation_id == conv.id, Participant.user_id == user_id)
        )).scalar_one_or_none()
        if existing:
            existing.is_following = False
        await self.session.flush()
        return {"conversation_id": str(conv.id), "following": False}

    # ── shared model: the conversation for an operational case ─
    _CASE_TO_CONV = {
        "emergency": ConvType.EMERGENCY, "support": ConvType.SUPPORT,
        "warranty": ConvType.WARRANTY, "vip": ConvType.VIP, "towing": ConvType.GENERAL,
    }
    _SEV_TO_PRIORITY = {"critical": "high", "high": "high", "medium": "medium", "low": "low"}

    async def get_or_create_for_case(self, case_id: uuid.UUID, *, allow_create: bool = True) -> dict:
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
            return await self.get_thread(existing.id)

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
        )
        # An opening system line so the thread isn't blank (author=system → no bell).
        await self.post_message(
            uuid.UUID(created["id"]),
            body=f"Case {case.code} opened · {case.title}",
            channel=case.channel or Channel.WEB, author_role=ParticipantRole.SYSTEM,
            author_name="System",
        )
        return await self.get_thread(uuid.UUID(created["id"]))

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
    def _view_where(self, stmt, view: str, user_id: uuid.UUID | None):
        open_ = Conversation.status.in_(list(
            {ConvStatus.OPEN, ConvStatus.WAITING_CUSTOMER,
             ConvStatus.WAITING_TECHNICIAN, ConvStatus.WAITING_APPROVAL}))
        if view == "needs_reply":
            return stmt.where(Conversation.status == ConvStatus.OPEN)
        if view == "assigned_me":
            return stmt.where(Conversation.assigned_user_id == user_id, open_)
        if view == "waiting_customer":
            return stmt.where(Conversation.status == ConvStatus.WAITING_CUSTOMER)
        if view == "waiting_technician":
            return stmt.where(Conversation.status == ConvStatus.WAITING_TECHNICIAN)
        if view == "waiting_approval":
            return stmt.where(Conversation.status == ConvStatus.WAITING_APPROVAL)
        if view == "unread":
            return stmt.where(or_(Conversation.unread_messages > 0, Conversation.unread_activity > 0))
        if view == "resolved":
            return stmt.where(Conversation.status == ConvStatus.RESOLVED)
        # mentions & sla_breached need per-row logic — handled after fetch.
        return stmt.where(open_)

    async def list_inbox(
        self, *, view: str = "needs_reply", channel: str | None = None,
        conv_type: str | None = None, user_id: uuid.UUID | None = None,
    ) -> dict:
        base = select(Conversation).where(
            Conversation.service_center_id == self.sc, Conversation.is_active.is_(True))
        if channel and channel != "all":
            base = base.where(Conversation.last_channel == channel)
        if conv_type and conv_type != "all":
            base = base.where(Conversation.conv_type == conv_type)

        # Sort by last *activity*, not last message — work floats threads up.
        stmt = self._view_where(base, view, user_id).order_by(Conversation.last_activity_at.desc().nullslast()).limit(80)
        rows = list((await self.session.execute(stmt)).scalars().all())

        if view == "mentions":
            rows = [c for c in rows if await self._has_mentions(c.id)]
        elif view == "sla_breached":
            rows = [c for c in rows if await self._sla_breached(c)]

        # Rows arrive newest-first from SQL; a *stable* sort by priority keeps
        # newest-first within each band without any date gymnastics.
        items = [await self.serialize_row(c) for c in rows]
        items.sort(key=lambda r: _PRIORITY_RANK.get(r["priority"], 1))
        return {"items": items, "counts": await self.queue_counts(user_id), "view": view}

    async def queue_counts(self, user_id: uuid.UUID | None) -> dict:
        base = select(func.count()).select_from(Conversation).where(
            Conversation.service_center_id == self.sc, Conversation.is_active.is_(True))
        out: dict[str, int] = {}
        for v in ("needs_reply", "assigned_me", "waiting_customer",
                  "waiting_technician", "waiting_approval", "unread", "resolved"):
            out[v] = int(await self.session.scalar(self._view_where(base, v, user_id)) or 0)
        return out

    async def _has_mentions(self, conversation_id: uuid.UUID) -> bool:
        return bool(await self.session.scalar(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == conversation_id,
                Message.mentions.isnot(None))))

    async def _sla_breached(self, conv: Conversation) -> bool:
        if not conv.case_id or not conv.is_open():
            return False
        case = await local_reference(self.session, OperationalCase, conv.case_id, self.sc)
        if not case:
            return False
        elapsed = (datetime.now(timezone.utc) - _utc(case.created_at)).total_seconds()
        return elapsed > case.sla_response_minutes * 60

    # ── thread detail ─────────────────────────────────────────
    async def get_thread(self, conversation_id: uuid.UUID, *, user_id: uuid.UUID | None = None) -> dict:
        conv = await self._get(conversation_id)
        data = await self.serialize_row(conv, full=True)

        msgs = list((await self.session.execute(
            select(Message).where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.asc())
        )).scalars().all())
        atts_by_msg = await self._attachments_for(conv.id)
        data["messages"] = [self._msg_dict(m, atts_by_msg.get(m.id, [])) for m in msgs]

        parts = list((await self.session.execute(
            select(Participant).where(Participant.conversation_id == conv.id)
        )).scalars().all())
        data["participants"] = [
            {"id": str(p.id), "role": p.role, "display_name": p.display_name,
             "is_online": p.is_online, "is_typing": p.is_typing,
             "is_following": p.is_following, "active_channel": p.active_channel}
            for p in parts]
        # Is the current user Following this thread (even if unassigned)?
        data["is_following"] = any(
            p.user_id == user_id and (p.is_following or p.role != ParticipantRole.WATCHER)
            for p in parts) if user_id else False
        data["followers"] = sum(1 for p in parts if p.is_following)

        data["activity"] = await self._activity(conv, data["messages"])
        data["pinned_notes"] = conv.pinned_notes or []
        return data

    async def _attachments_for(self, conversation_id: uuid.UUID) -> dict:
        rows = list((await self.session.execute(
            select(Attachment).where(Attachment.conversation_id == conversation_id)
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
            ).order_by(Notification.created_at.desc()).limit(40)
        )).scalars().all())

        feed = [{"type": "event", "title": n.title, "detail": n.body,
                 "date": n.created_at.isoformat(), "severity": n.severity,
                 "category": n.category} for n in events]
        feed += [{"type": "message", "title": m["author_name"] or m["author_role"],
                  "detail": m["body"], "date": m["created_at"], "severity": "info",
                  "author_role": m["author_role"], "channel": m["channel"]} for m in messages]
        feed.sort(key=lambda x: x["date"] or "")
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
            "case_id": str(conv.case_id) if conv.case_id else None,
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
                out["sla_elapsed_seconds"] = elapsed
                out["sla_response_minutes"] = case.sla_response_minutes
                out["sla_breached"] = case.is_open() and elapsed > case.sla_response_minutes * 60

        if full:
            out["linked"] = await self._linked_cards(conv)
        return out

    async def _linked_cards(self, conv: Conversation) -> list:
        """The context-sidebar cards — only present links appear."""
        cards: list[dict] = []
        if conv.case_id:
            case = await local_reference(self.session, OperationalCase, conv.case_id, self.sc)
            if case:
                cards.append({"kind": "case", "title": f"{case.code} · {case.case_type.title()}",
                              "subtitle": STATUS_LABEL.get(case.status, case.status),
                              "link": f"/operations/{case.id}"})
        if conv.vehicle_id:
            report = await self.maintenance.calculate_due_services(conv.vehicle_id)
            vehicle = await self.maintenance.vehicle_repo.get_with_model(conv.vehicle_id)
            cards.append({"kind": "vehicle", "title": _vehicle_label(vehicle) if vehicle else "Vehicle",
                          "subtitle": f"Health {report.overall_score} · {_band(report.overall_score).title()}",
                          "score": report.overall_score, "band": _band(report.overall_score),
                          "link": f"/vehicles/{conv.vehicle_id}"})
        if conv.customer_id:
            cust = await local_reference(self.session, Customer, conv.customer_id, self.sc)
            if cust:
                cards.append({"kind": "customer", "title": cust.full_name,
                              "subtitle": "Customer 360", "phone": cust.phone,
                              "link": f"/customers/{cust.id}"})
        if conv.vehicle_id:
            cards.append({"kind": "passport", "title": "Certified Passport",
                          "subtitle": "View", "link": f"/passport/{conv.vehicle_id}"})
        return cards


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
