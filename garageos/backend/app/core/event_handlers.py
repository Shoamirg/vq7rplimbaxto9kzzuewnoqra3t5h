"""Domain-event handlers wired to the in-process EventBus.

These run after a Unit of Work commits, decoupling side effects (notifications)
from the request path. For now they log; this is the seam where the Telegram bot
(and later email/SMS) will send real customer notifications — added here, not in
the API endpoint, so new channels don't touch business logic.
"""
from __future__ import annotations

import logging

from app.core.events import (
    AppointmentCancelled,
    AppointmentCompleted,
    AppointmentConfirmed,
    AppointmentCreated,
    AppointmentStarted,
    MaintenanceDue,
    event_bus,
)

logger = logging.getLogger("events")

_registered = False


def _on_created(e: AppointmentCreated) -> None:
    logger.info("AppointmentCreated appt=%s customer=%s", e.appointment_id, e.customer_id)


def _on_confirmed(e: AppointmentConfirmed) -> None:
    # TODO(telegram): send "appointment confirmed" message to the customer.
    logger.info("NOTIFY confirmed appt=%s customer=%s", e.appointment_id, e.customer_id)


def _on_started(e: AppointmentStarted) -> None:
    logger.info("AppointmentStarted appt=%s", e.appointment_id)


def _on_cancelled(e: AppointmentCancelled) -> None:
    logger.info("NOTIFY cancelled appt=%s reason=%s", e.appointment_id, e.reason)


def _on_completed(e: AppointmentCompleted) -> None:
    # TODO(telegram): send service summary + updated vehicle health.
    logger.info("NOTIFY completed appt=%s record=%s", e.appointment_id, e.service_record_id)


def _on_maintenance_due(e: MaintenanceDue) -> None:
    logger.info(
        "MaintenanceDue vehicle=%s service=%s due_km=%s",
        e.vehicle_id, e.service_type, e.due_km,
    )


def register_event_handlers() -> None:
    """Idempotently register all handlers (safe to call once per process)."""
    global _registered
    if _registered:
        return
    event_bus.register(AppointmentCreated, _on_created)
    event_bus.register(AppointmentConfirmed, _on_confirmed)
    event_bus.register(AppointmentStarted, _on_started)
    event_bus.register(AppointmentCancelled, _on_cancelled)
    event_bus.register(AppointmentCompleted, _on_completed)
    event_bus.register(MaintenanceDue, _on_maintenance_due)
    _registered = True
    logger.info("Domain event handlers registered")
