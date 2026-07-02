from __future__ import annotations
import logging
import uuid as _uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Type
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class DomainEvent:
    """Base class for all domain events."""
    event_id: str = field(default_factory=lambda: str(_uuid.uuid4()))
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    aggregate_id: UUID | None = None


@dataclass(kw_only=True)
class AppointmentCreated(DomainEvent):
    customer_id: UUID
    vehicle_id: UUID
    appointment_id: UUID
    service_center_id: UUID


@dataclass(kw_only=True)
class AppointmentConfirmed(DomainEvent):
    appointment_id: UUID
    customer_id: UUID
    vehicle_id: UUID
    service_center_id: UUID | None = None


@dataclass(kw_only=True)
class AppointmentCompleted(DomainEvent):
    appointment_id: UUID
    service_record_id: UUID | None = None
    service_center_id: UUID | None = None
    vehicle_label: str | None = None


@dataclass(kw_only=True)
class AppointmentCancelled(DomainEvent):
    appointment_id: UUID
    reason: str | None = None
    service_center_id: UUID | None = None


@dataclass(kw_only=True)
class VehicleAdded(DomainEvent):
    vehicle_id: UUID
    customer_id: UUID
    brand: str
    model: str


@dataclass(kw_only=True)
class MileageUpdated(DomainEvent):
    vehicle_id: UUID
    previous_km: int
    new_km: int


@dataclass(kw_only=True)
class MaintenanceDue(DomainEvent):
    vehicle_id: UUID
    customer_id: UUID
    service_type: str
    due_km: int | None = None
    due_date: datetime | None = None
    service_center_id: UUID | None = None


@dataclass(kw_only=True)
class CaseOpened(DomainEvent):
    service_center_id: UUID
    case_id: UUID
    code: str
    case_type: str
    severity: str
    title: str
    customer_id: UUID
    vehicle_id: UUID | None = None


@dataclass(kw_only=True)
class CaseAssigned(DomainEvent):
    service_center_id: UUID
    case_id: UUID
    code: str
    mechanic_name: str | None = None
    customer_id: UUID | None = None
    vehicle_id: UUID | None = None


@dataclass(kw_only=True)
class CaseStatusChanged(DomainEvent):
    service_center_id: UUID
    case_id: UUID
    code: str
    status: str
    customer_id: UUID | None = None
    vehicle_id: UUID | None = None


@dataclass(kw_only=True)
class CaseResolved(DomainEvent):
    service_center_id: UUID
    case_id: UUID
    code: str
    customer_id: UUID | None = None
    vehicle_id: UUID | None = None


EventHandler = Callable[[DomainEvent], Any]


class EventBus:
    """Simple in-process event bus. Replace with Redis pub/sub for scale."""

    _handlers: Dict[Type[DomainEvent], List[EventHandler]] = {}

    @classmethod
    def register(cls, event_type: Type[DomainEvent], handler: EventHandler) -> None:
        cls._handlers.setdefault(event_type, []).append(handler)
        logger.debug("Registered handler %s for %s", handler.__name__, event_type.__name__)

    @classmethod
    def dispatch(cls, event: DomainEvent) -> None:
        handlers = cls._handlers.get(type(event), [])
        if not handlers:
            logger.debug("No handlers for event %s", type(event).__name__)
            return
        for handler in handlers:
            try:
                handler(event)
            except Exception:
                logger.exception("Handler %s failed for event %s", handler.__name__, type(event).__name__)

    @classmethod
    def clear(cls) -> None:
        cls._handlers.clear()


# Singleton
event_bus = EventBus()
