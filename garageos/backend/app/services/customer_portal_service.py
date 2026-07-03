"""Read/aggregation service behind the customer Mini App API.

Every method is bound to a single authenticated :class:`Customer` and only ever
returns that customer's own data. This is the strict boundary the design calls
for: the Mini App *composes existing platform capabilities* (health, passport,
billing, messages, cases) but can never reach another customer's — or the
staff's — data, and never leaks staff-only fields (internal notes, payer scores).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.exceptions import NotFoundError, VehicleNotFound
from app.models.conversation import (
    Channel,
    Conversation,
    MessageKind,
    ParticipantRole,
)
from app.models.customer import Customer
from app.models.invoice import InvoiceKind, InvoiceStatus
from app.models.notification import Notification
from app.models.operational_case import CaseStatus, CaseType, OperationalCase
from app.models.service_center import ServiceCenter
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.models.conversation import Attachment, Message
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import (
    ActivityItem,
    BillingDoc,
    BillingReceipt,
    BillingResponse,
    ConversationCard,
    GarageIdentity,
    HomeAppointment,
    HomeInvoice,
    HomeMessage,
    HomeResponse,
    HomeVehicle,
    MeResponse,
    MessagesResponse,
    RoadsideCase,
    RoadsideRequest,
    RoadsideStatusStep,
    ThreadAttachment,
    ThreadMessage,
    ThreadResponse,
    VehicleCard,
    VehiclesResponse,
)
from app.services.case_service import CaseService
from app.services.conversation_service import ConversationService
from app.services.financial_service import FinancialService
from app.services.vehicle_health_service import VehicleHealthService

# case status -> the customer-facing tracking stepper
_ROADSIDE_FLOW = [
    ("reported", "Reported", {CaseStatus.NEW, CaseStatus.ACKNOWLEDGED}),
    ("assigned", "Assigned", {CaseStatus.ASSIGNED}),
    ("en_route", "En route", {CaseStatus.EN_ROUTE}),
    ("arrived", "Arrived", {CaseStatus.IN_PROGRESS, CaseStatus.WAITING_CUSTOMER}),
    ("resolved", "Resolved", {CaseStatus.RESOLVED, CaseStatus.CLOSED}),
]


def _tier(score: float) -> str | None:
    if score >= 90:
        return "Gold"
    if score >= 75:
        return "Silver"
    if score >= 60:
        return "Bronze"
    return None


class CustomerPortalService:
    def __init__(self, uow: UnitOfWork, customer: Customer):
        self.uow = uow
        self.session = uow.session
        self.customer = customer

    # ── ownership guards ────────────────────────────────────────────────────
    _VEHICLE_LOAD = selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand)

    async def _own_vehicles(self) -> list[Vehicle]:
        rows = await self.session.execute(
            select(Vehicle)
            .where(
                Vehicle.customer_id == self.customer.id,
                Vehicle.is_active == True,  # noqa: E712
            )
            .options(self._VEHICLE_LOAD)
            .order_by(Vehicle.created_at.asc())
        )
        return list(rows.scalars().all())

    async def _own_vehicle(self, vehicle_id: uuid.UUID) -> Vehicle:
        vehicle = (await self.session.execute(
            select(Vehicle).where(Vehicle.id == vehicle_id).options(self._VEHICLE_LOAD)
        )).scalar_one_or_none()
        if (
            vehicle is None
            or not vehicle.is_active
            or vehicle.customer_id != self.customer.id
        ):
            raise VehicleNotFound(vehicle_id)  # never leak another customer's id
        return vehicle

    async def _own_conversation(self, conversation_id: uuid.UUID) -> Conversation:
        conv = await self.session.get(Conversation, conversation_id)
        if conv is None or not conv.is_active or conv.customer_id != self.customer.id:
            raise NotFoundError("Conversation not found")
        return conv

    # ── profile ─────────────────────────────────────────────────────────────
    async def me(self) -> MeResponse:
        vehicle_count = await self.session.scalar(
            select(func.count())
            .select_from(Vehicle)
            .where(
                Vehicle.customer_id == self.customer.id,
                Vehicle.is_active == True,  # noqa: E712
            )
        )
        center = await self.session.get(ServiceCenter, self.customer.service_center_id)
        return MeResponse(
            id=str(self.customer.id),
            full_name=self.customer.full_name,
            phone=self.customer.phone,
            email=self.customer.email,
            loyalty_points=self.customer.loyalty_points or 0,
            member_since=self.customer.created_at,
            vehicle_count=int(vehicle_count or 0),
            garage=self._garage(center),
        )

    # ── home (action-first) ─────────────────────────────────────────────────
    async def home(self) -> HomeResponse:
        center = await self.session.get(ServiceCenter, self.customer.service_center_id)
        return HomeResponse(
            greeting=self.customer.full_name.split()[0] if self.customer.full_name else "there",
            garage=self._garage(center),
            sos_available=True,
            **(await self._outstanding_card()),
            next_appointment=await self._next_appointment(),
            latest_message=await self._latest_message(),
            primary_vehicle=await self._primary_vehicle(),
            activity=await self._activity(limit=6),
        )

    async def _outstanding_card(self) -> dict:
        summary = await FinancialService(self.uow).customer_summary(self.customer.id)
        balance = summary["outstanding"]
        open_docs = [
            d for d in summary["invoices"]
            if d["kind"] == InvoiceKind.INVOICE and d["balance"] > 0.005
        ]
        open_docs.sort(key=lambda d: (d["due_date"] or "9999"))
        card = open_docs[0] if open_docs else None
        return {
            "outstanding_balance": balance,
            "outstanding_invoice": (
                HomeInvoice(id=card["id"], code=card["code"], balance=card["balance"])
                if card else None
            ),
        }

    async def _next_appointment(self) -> HomeAppointment | None:
        appts = await AppointmentReader(self).upcoming()
        return appts[0] if appts else None

    async def _latest_message(self) -> HomeMessage | None:
        conv = (await self.session.execute(
            select(Conversation)
            .where(
                Conversation.customer_id == self.customer.id,
                Conversation.is_active == True,  # noqa: E712
            )
            .order_by(Conversation.last_activity_at.desc().nullslast())
            .limit(1)
        )).scalar_one_or_none()
        if conv is None:
            return None
        return HomeMessage(
            id=str(conv.id),
            subject=conv.subject,
            preview=conv.last_message_preview,
            last_message_at=conv.last_message_at,
            awaiting_you=bool(conv.last_sender_role and conv.last_sender_role != ParticipantRole.CUSTOMER),
        )

    async def _primary_vehicle(self) -> HomeVehicle | None:
        vehicles = await self._own_vehicles()
        if not vehicles:
            return None
        health = VehicleHealthService(self.uow)
        scored: list[tuple[Vehicle, float, str]] = []
        for v in vehicles:
            report = await health.get_health(v.id)
            scored.append((v, report["overall_score"], report["band"]))
        # Surface the vehicle that most needs attention (lowest score).
        v, score, band = min(scored, key=lambda s: s[1])
        return HomeVehicle(
            id=str(v.id),
            label=self._vehicle_label(v),
            health_score=score,
            band=band,
            passport_tier=_tier(score),
        )

    # ── vehicles ────────────────────────────────────────────────────────────
    async def vehicles(self) -> VehiclesResponse:
        vehicles = await self._own_vehicles()
        health = VehicleHealthService(self.uow)
        cards: list[VehicleCard] = []
        for v in vehicles:
            report = await health.get_health(v.id)
            vm = v.vehicle_model
            cards.append(VehicleCard(
                id=str(v.id),
                label=self._vehicle_label(v),
                make=(vm.brand.name if vm and getattr(vm, "brand", None) else None),
                model=(vm.name if vm else None),
                year=v.year,
                plate=v.license_plate,
                mileage=v.current_km,
                health_score=report["overall_score"],
                band=report["band"],
            ))
        return VehiclesResponse(vehicles=cards)

    async def vehicle_passport(self, vehicle_id: uuid.UUID) -> dict:
        await self._own_vehicle(vehicle_id)  # strict ownership
        return await VehicleHealthService(self.uow).get_passport(vehicle_id)

    async def vehicle_health(self, vehicle_id: uuid.UUID) -> dict:
        await self._own_vehicle(vehicle_id)
        return await VehicleHealthService(self.uow).get_health(vehicle_id)

    async def vehicle_timeline(self, vehicle_id: uuid.UUID) -> dict:
        await self._own_vehicle(vehicle_id)
        return await VehicleHealthService(self.uow).get_timeline(vehicle_id)

    # ── billing (plain language, no payer scoring) ──────────────────────────
    async def billing(self) -> BillingResponse:
        summary = await FinancialService(self.uow).customer_summary(self.customer.id)
        invoices = [self._doc(d) for d in summary["invoices"]]
        estimates = [
            self._doc(d) for d in summary["estimates"]
            if d["status"] in (InvoiceStatus.SENT, InvoiceStatus.VIEWED,
                               InvoiceStatus.DRAFT, InvoiceStatus.APPROVED)
        ]
        receipts = [
            BillingReceipt(id=p["id"], amount=p["amount"], method=p["method"],
                           date=p["received_at"])
            for p in summary["payments"] if p["kind"] != "refund"
        ]
        open_docs = [d for d in invoices if d.balance > 0.005]
        open_docs.sort(key=lambda d: (d.due_date or "9999"))
        balance = round(summary["outstanding"], 2)
        return BillingResponse(
            has_balance=balance > 0.005,
            balance_due=balance,
            primary_invoice=open_docs[0] if open_docs else None,
            invoices=invoices,
            estimates=estimates,
            receipts=receipts,
        )

    # ── messages (customer-safe threads: internal notes excluded) ───────────
    async def messages(self) -> MessagesResponse:
        convs = (await self.session.execute(
            select(Conversation)
            .where(
                Conversation.customer_id == self.customer.id,
                Conversation.is_active == True,  # noqa: E712
            )
            .order_by(Conversation.last_activity_at.desc().nullslast())
            .limit(40)
        )).scalars().all()
        cards = [
            ConversationCard(
                id=str(c.id), subject=c.subject, status=c.status,
                preview=c.last_message_preview, last_message_at=c.last_message_at,
                awaiting_you=bool(c.last_sender_role and c.last_sender_role != ParticipantRole.CUSTOMER),
            )
            for c in convs
        ]
        return MessagesResponse(conversations=cards, activity=await self._activity(limit=20))

    async def thread(self, conversation_id: uuid.UUID) -> ThreadResponse:
        conv = await self._own_conversation(conversation_id)
        msgs = (await self.session.execute(
            select(Message)
            .where(
                Message.conversation_id == conv.id,
                Message.is_internal == False,  # noqa: E712  never expose internal notes
            )
            .order_by(Message.created_at.asc())
        )).scalars().all()
        atts = await self._attachments_by_message(conv.id)
        return ThreadResponse(
            id=str(conv.id),
            subject=conv.subject,
            status=conv.status,
            messages=[self._thread_msg(m, atts.get(m.id, [])) for m in msgs],
        )

    async def post_message(self, conversation_id: uuid.UUID, body: str) -> ThreadMessage:
        conv = await self._own_conversation(conversation_id)
        msg = await ConversationService(self.uow).post_message(
            conv.id,
            body=body,
            channel=Channel.TELEGRAM,
            author_role=ParticipantRole.CUSTOMER,
            author_name=self.customer.full_name,
            kind=MessageKind.TEXT,
        )
        return ThreadMessage(
            id=msg["id"], from_me=True, author_name=msg["author_name"],
            body=msg["body"], created_at=msg["created_at"],
            attachments=[ThreadAttachment(**{k: a.get(k) for k in ("id", "kind", "label", "url")})
                         for a in msg.get("attachments", [])],
        )

    # ── roadside (creates a case → rides the existing event stream) ─────────
    async def create_roadside(self, req: RoadsideRequest) -> RoadsideCase:
        vehicle: Vehicle | None = None
        if req.vehicle_id:
            vehicle = await self._own_vehicle(uuid.UUID(req.vehicle_id))
        else:
            owned = await self._own_vehicles()
            vehicle = owned[0] if owned else None

        label = self._vehicle_label(vehicle) if vehicle else "my vehicle"
        created = await CaseService(self.uow).create_case(
            customer_id=self.customer.id,
            title=f"Roadside assistance — {label}",
            case_type=CaseType.EMERGENCY,
            severity="high",
            description=req.description,
            channel=Channel.TELEGRAM,
            vehicle_id=vehicle.id if vehicle else None,
            location_text=req.location_text,
            location_lat=req.location_lat,
            location_lng=req.location_lng,
        )
        case = await self.session.get(OperationalCase, uuid.UUID(created["id"]))
        # Open the dispatcher conversation now so "Message dispatcher" works.
        conv = await ConversationService(self.uow).get_or_create_for_case(case.id)
        return self._roadside(case, conversation_id=conv.get("id"))

    async def roadside_status(self, case_id: uuid.UUID) -> RoadsideCase:
        case = await self.session.get(OperationalCase, case_id)
        if case is None or case.customer_id != self.customer.id:
            raise NotFoundError("Case not found")
        conv = (await self.session.execute(
            select(Conversation.id).where(
                Conversation.case_id == case.id,
                Conversation.is_active == True,  # noqa: E712
            ).limit(1)
        )).scalar_one_or_none()
        return self._roadside(case, conversation_id=str(conv) if conv else None)

    # ── shared internals ────────────────────────────────────────────────────
    async def _activity(self, *, limit: int) -> list[ActivityItem]:
        vehicle_ids = [v.id for v in await self._own_vehicles()]
        conds = [Notification.customer_id == self.customer.id]
        if vehicle_ids:
            conds.append(Notification.vehicle_id.in_(vehicle_ids))
        rows = (await self.session.execute(
            select(Notification)
            .where(Notification.service_center_id == self.customer.service_center_id, or_(*conds))
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )).scalars().all()
        return [
            ActivityItem(title=n.title, detail=n.body, category=n.category,
                         severity=n.severity, date=n.created_at)
            for n in rows
        ]

    async def _attachments_by_message(self, conversation_id: uuid.UUID) -> dict:
        rows = (await self.session.execute(
            select(Attachment).where(Attachment.conversation_id == conversation_id)
        )).scalars().all()
        out: dict[uuid.UUID, list] = {}
        for a in rows:
            out.setdefault(a.message_id, []).append(a)
        return out

    def _thread_msg(self, m: Message, attachments: list) -> ThreadMessage:
        return ThreadMessage(
            id=str(m.id),
            from_me=(m.author_role == ParticipantRole.CUSTOMER),
            author_name=m.author_name,
            body=m.body,
            created_at=m.created_at,
            attachments=[ThreadAttachment(id=str(a.id), kind=a.kind, label=a.label, url=a.url)
                         for a in attachments],
        )

    def _roadside(self, case: OperationalCase, *, conversation_id: str | None) -> RoadsideCase:
        seen_current = False
        steps: list[RoadsideStatusStep] = []
        resolved = case.status in (CaseStatus.RESOLVED, CaseStatus.CLOSED)
        for key, label, statuses in _ROADSIDE_FLOW:
            is_current = case.status in statuses and not resolved
            done = False
            if is_current:
                done = key == "resolved"
                current = True
                seen_current = True
            else:
                current = False
                done = not seen_current  # every step before the current one is done
            if resolved:
                done, current = True, key == "resolved"
            steps.append(RoadsideStatusStep(key=key, label=label, done=done, current=current))
        return RoadsideCase(
            id=str(case.id), code=case.code, status=case.status, title=case.title,
            severity=case.severity, created_at=case.created_at,
            vehicle_id=str(case.vehicle_id) if case.vehicle_id else None,
            conversation_id=conversation_id, steps=steps,
        )

    @staticmethod
    def _doc(d: dict) -> BillingDoc:
        return BillingDoc(
            id=d["id"], code=d["code"], kind=d["kind"], status=d["status"],
            total=d["total"], balance=d["balance"],
            due_date=d["due_date"], created_at=d["created_at"],
        )

    @staticmethod
    def _vehicle_label(vehicle: Vehicle | None) -> str:
        if vehicle is None:
            return "Vehicle"
        vm = getattr(vehicle, "vehicle_model", None)
        brand = vm.brand.name if vm and getattr(vm, "brand", None) else ""
        model = vm.name if vm else ""
        label = f"{brand} {model}".strip()
        return label or vehicle.license_plate or "Vehicle"

    @staticmethod
    def _garage(center: ServiceCenter | None) -> GarageIdentity:
        if center is None:
            return GarageIdentity(id="", name="GarageOS")
        return GarageIdentity(
            id=str(center.id),
            name=center.brand_name or center.name,
            tagline=center.tagline,
            phone=center.phone,
        )


class AppointmentReader:
    """Small helper: the customer's upcoming appointments as Home cards.

    Reads appointments directly (customer-scoped) so we return narrow customer
    DTOs rather than the staff appointment shape.
    """

    def __init__(self, portal: CustomerPortalService):
        self.portal = portal

    async def upcoming(self) -> list[HomeAppointment]:
        from app.models.appointment import Appointment

        today = date.today()
        rows = (await self.portal.session.execute(
            select(Appointment)
            .where(
                Appointment.customer_id == self.portal.customer.id,
                Appointment.is_active == True,  # noqa: E712
                Appointment.appointment_date >= today,
                Appointment.status.notin_(["cancelled", "completed"]),
            )
            .options(selectinload(Appointment.vehicle).selectinload(Vehicle.vehicle_model))
            .order_by(Appointment.appointment_date.asc())
            .limit(5)
        )).scalars().all()
        return [
            HomeAppointment(
                id=str(a.id),
                date=a.appointment_date.isoformat(),
                time=a.appointment_time,
                service_type=a.service_type,
                status=a.status,
                vehicle_label=CustomerPortalService._vehicle_label(getattr(a, "vehicle", None)),
            )
            for a in rows
        ]
