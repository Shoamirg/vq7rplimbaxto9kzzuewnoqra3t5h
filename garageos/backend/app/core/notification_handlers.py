"""Transactional domain-event -> notification projection.

This is the "notification engine": it maps domain events to persisted
notifications in the same UnitOfWork transaction. Business modules stay
ignorant of notification channels — they only emit events. Adding a new
channel (Telegram/email/push) later means adding a consumer here.
"""
from __future__ import annotations

from typing import Optional

from app.core.events import (
    AppointmentCancelled,
    AppointmentCompleted,
    AppointmentConfirmed,
    AppointmentCreated,
    CaseAssigned,
    CaseOpened,
    CaseResolved,
    CaseStatusChanged,
    EstimateApproved,
    EstimateCreated,
    EstimateRejected,
    EstimateSent,
    InvoiceIssued,
    InvoicePaid,
    MaintenanceDue,
    MessagePosted,
    PaymentReceived,
)
from app.repositories.unit_of_work import UnitOfWork
from app.services.notification_service import NotificationService

def _spec_for(event) -> Optional[dict]:
    """Map a domain event to a notification spec, or None to ignore it."""
    sc = getattr(event, "service_center_id", None)
    if sc is None:
        return None

    if isinstance(event, AppointmentCompleted):
        return dict(
            service_center_id=sc, category="appointment", severity="info",
            title="Service completed",
            body=f"{event.vehicle_label} — health recalculated." if event.vehicle_label else "An appointment was completed and health was recalculated.",
            entity_type="appointment", entity_id=event.appointment_id, link="/calendar",
        )
    if isinstance(event, AppointmentConfirmed):
        return dict(
            service_center_id=sc, category="appointment", severity="low",
            title="Appointment confirmed",
            entity_type="appointment", entity_id=event.appointment_id, link="/calendar",
        )
    if isinstance(event, AppointmentCancelled):
        return dict(
            service_center_id=sc, category="appointment", severity="medium",
            title="Appointment cancelled", body=event.reason,
            entity_type="appointment", entity_id=event.appointment_id, link="/calendar",
        )
    if isinstance(event, AppointmentCreated):
        return dict(
            service_center_id=sc, category="appointment", severity="info",
            title="New appointment booked",
            entity_type="appointment", entity_id=event.appointment_id, link="/calendar",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    if isinstance(event, MaintenanceDue):
        overdue = event.due_km is not None and event.due_km < 0
        return dict(
            service_center_id=sc, category="vehicle",
            severity="high" if overdue else "medium",
            title=f"{'Overdue' if overdue else 'Due soon'}: {event.service_type}",
            body="A vehicle needs attention.",
            entity_type="vehicle", entity_id=event.vehicle_id, link=f"/vehicles/{event.vehicle_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    # ── Operations Center cases ──
    if isinstance(event, CaseOpened):
        cat = "emergency" if event.case_type == "emergency" else "operations"
        return dict(
            service_center_id=sc, category=cat, severity=event.severity,
            title=f"{event.case_type.title()} case opened", body=event.title,
            entity_type="case", entity_id=event.case_id, link=f"/operations/{event.case_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    if isinstance(event, CaseAssigned):
        return dict(
            service_center_id=sc, category="operations", severity="low",
            title="Case assigned", body=f"Assigned to {event.mechanic_name}" if event.mechanic_name else None,
            entity_type="case", entity_id=event.case_id, link=f"/operations/{event.case_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    if isinstance(event, CaseStatusChanged):
        return dict(
            service_center_id=sc, category="operations", severity="low",
            title=f"Case · {event.status.replace('_', ' ')}",
            entity_type="case", entity_id=event.case_id, link=f"/operations/{event.case_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    if isinstance(event, CaseResolved):
        return dict(
            service_center_id=sc, category="operations", severity="info", title="Case resolved",
            entity_type="case", entity_id=event.case_id, link=f"/operations/{event.case_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    # ── Unified Communications Platform ──
    if isinstance(event, MessagePosted):
        # Only surface things that need a human: inbound customer messages and
        # @mentions. Staff replies flow into the thread without ringing the bell.
        mentioned = bool(event.mentions)
        inbound = event.author_role == "customer"
        if not (mentioned or inbound):
            return None
        if mentioned:
            title = "You were mentioned"
            category = "mention"
        else:
            title = f"New message from {event.author_name}" if event.author_name else "New customer message"
            category = "message"
        return dict(
            service_center_id=sc, category=category, severity="medium", title=title,
            body=event.preview,
            entity_type="conversation", entity_id=event.conversation_id,
            link=f"/inbox/{event.conversation_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    # ── Commercial Operations (billing) ── feeds the bell + financial timeline
    if isinstance(event, (EstimateCreated, EstimateSent, EstimateApproved,
                          EstimateRejected, InvoiceIssued, PaymentReceived, InvoicePaid)):
        title, sev = {
            "EstimateCreated": ("Estimate created", "info"),
            "EstimateSent": ("Estimate sent", "low"),
            "EstimateApproved": ("Estimate approved", "medium"),
            "EstimateRejected": ("Estimate declined", "medium"),
            "InvoiceIssued": ("Invoice issued", "medium"),
            "PaymentReceived": ("Payment received", "medium"),
            "InvoicePaid": ("Invoice paid", "info"),
        }[type(event).__name__]
        body = None
        if isinstance(event, PaymentReceived) and event.amount is not None:
            if event.kind == "refund":
                title = "Refund issued"
            body = f"{event.currency} {event.amount:,.2f}" + (f" · {event.method}" if event.method else "")
        return dict(
            service_center_id=sc, category="finance", severity=sev,
            title=f"{title} · {event.code}", body=body,
            entity_type="invoice", entity_id=event.invoice_id, link=f"/billing/{event.invoice_id}",
            vehicle_id=event.vehicle_id, customer_id=event.customer_id,
        )
    return None


async def persist_transactional_notifications(uow: UnitOfWork, events: list) -> None:
    """Write notification rows using the business UoW's session and transaction."""
    service = NotificationService(uow)
    for event in events:
        spec = _spec_for(event)
        if not spec:
            continue
        event_center_id = spec.pop("service_center_id")
        if event_center_id != uow.service_center_id:
            raise RuntimeError("Notification event tenant does not match its UnitOfWork")
        await service.create(**spec)
