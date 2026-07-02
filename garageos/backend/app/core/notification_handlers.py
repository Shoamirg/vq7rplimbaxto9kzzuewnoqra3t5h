"""EventBus -> Notification bridge.

This is the "notification engine": it subscribes to domain events and turns
them into persisted notifications. Business modules stay ignorant of channels —
they only emit events. Adding a new channel (Telegram/email/push) later means
adding a consumer here, not touching business logic.

Persistence is scheduled as a background task because dispatch runs synchronously
inside the UoW's post-commit hook; the task opens its own short transaction.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

from app.core.events import (
    AppointmentCancelled,
    AppointmentCompleted,
    AppointmentConfirmed,
    AppointmentCreated,
    MaintenanceDue,
    event_bus,
)
from app.repositories.unit_of_work import UnitOfWork
from app.services.notification_service import NotificationService

logger = logging.getLogger("notifications")

# Hold references to in-flight tasks so they aren't garbage-collected mid-run.
_tasks: set[asyncio.Task] = set()
_registered = False


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
        )
    if isinstance(event, MaintenanceDue):
        overdue = event.due_km is not None and event.due_km < 0
        return dict(
            service_center_id=sc, category="vehicle",
            severity="high" if overdue else "medium",
            title=f"{'Overdue' if overdue else 'Due soon'}: {event.service_type}",
            body="A vehicle needs attention.",
            entity_type="vehicle", entity_id=event.vehicle_id, link=f"/vehicles/{event.vehicle_id}",
        )
    return None


async def _persist(spec: dict) -> None:
    sc: uuid.UUID = spec.pop("service_center_id")
    try:
        async with UnitOfWork(service_center_id=sc) as uow:
            await NotificationService(uow).create(**spec)
    except Exception:
        logger.exception("Failed to persist notification for %s", spec.get("title"))


def _handle(event) -> None:
    spec = _spec_for(event)
    if not spec:
        return
    try:
        task = asyncio.create_task(_persist(spec))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    except RuntimeError:
        # No running loop (e.g. a sync/script context) — skip gracefully.
        logger.debug("No event loop; skipping notification for %s", spec.get("title"))


def register_notification_handlers() -> None:
    global _registered
    if _registered:
        return
    for evt in (AppointmentCreated, AppointmentConfirmed, AppointmentCancelled,
                AppointmentCompleted, MaintenanceDue):
        event_bus.register(evt, _handle)
    _registered = True
    logger.info("Notification handlers registered")
