"""Work-order use cases and tenant-safe response serialization."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.exceptions import (
    AppointmentNotFound,
    CustomerNotFound,
    VehicleNotFound,
    WorkOrderConflict,
    WorkOrderNotFound,
    WorkOrderValidationError,
)
from app.models.appointment import AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.work_order import WorkOrderStatus
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.work_order_repository import (
    WorkOrderRepository,
    get_appointment_for_update,
    get_user_for_tenant,
)
from app.schemas.work_order import WorkOrderCreateRequest
from app.services.work_order_policy import request_fingerprint, require_work_order_action


def serialize_work_order(order: Any) -> dict:
    """Flatten work-order relations without exposing customer phone or address."""
    vehicle = order.vehicle
    vehicle_model = getattr(vehicle, "vehicle_model", None) if vehicle else None
    brand = getattr(getattr(vehicle_model, "brand", None), "name", "")
    model = getattr(vehicle_model, "name", "")
    plate = getattr(vehicle, "license_plate", None) if vehicle else None
    vehicle_summary = " ".join(part for part in (brand, model) if part)
    if plate:
        vehicle_summary = f"{vehicle_summary} ({plate})".strip()

    return {
        "id": str(order.id),
        "customer_id": str(order.customer_id),
        "customer_name": order.customer.full_name if order.customer else "",
        "vehicle_id": str(order.vehicle_id),
        "vehicle_summary": vehicle_summary,
        "appointment_id": str(order.appointment_id) if order.appointment_id else None,
        "assigned_mechanic_user_id": str(order.assigned_mechanic_user_id) if order.assigned_mechanic_user_id else None,
        "assigned_mechanic_name": order.assigned_mechanic.full_name if order.assigned_mechanic else None,
        "created_by_user_id": str(order.created_by_user_id),
        "service_type": order.service_type,
        "customer_concern": order.customer_concern,
        "work_performed": order.work_performed,
        "status": order.status,
        "intake_odometer_km": order.intake_odometer_km,
        "completion_odometer_km": order.completion_odometer_km,
        "actual_cost": Decimal(order.actual_cost) if order.actual_cost is not None else None,
        "service_record_id": str(order.service_record.id) if order.service_record else None,
        "received_at": order.received_at,
        "started_at": order.started_at,
        "ready_at": order.ready_at,
        "completed_at": order.completed_at,
        "cancelled_at": order.cancelled_at,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


class WorkOrderService:
    def __init__(self, uow: UnitOfWork, actor):
        self.uow = uow
        self.actor = actor
        self.service_center_id = uow.service_center_id
        self.work_order_repo = WorkOrderRepository(uow.session, self.service_center_id)
        self.customer_repo = CustomerRepository(uow.session, self.service_center_id)
        self.vehicle_repo = VehicleRepository(uow.session, self.service_center_id)

    async def _lock_idempotency_key(self, key: str) -> None:
        """Serialize same-tenant retries in PostgreSQL; unique constraint is the backstop."""
        bind = getattr(self.uow.session, "bind", None)
        if getattr(getattr(bind, "dialect", None), "name", None) != "postgresql":
            return
        lock_material = f"{self.service_center_id}:{key}".encode("utf-8")
        lock_id = int.from_bytes(hashlib.sha256(lock_material).digest()[:8], "big", signed=True)
        await self.uow.session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id}
        )

    async def create_work_order(self, body: WorkOrderCreateRequest, idempotency_key: str) -> dict:
        role = getattr(self.actor, "role", None)
        require_work_order_action(
            getattr(role, "name", None),
            role_active=bool(role and getattr(role, "is_active", False)),
            action="create",
        )
        if self.actor.service_center_id != self.service_center_id:
            raise WorkOrderNotFound()
        key = idempotency_key.strip()
        if not key or len(key) > 255:
            raise WorkOrderValidationError("Idempotency-Key must contain between 1 and 255 characters")

        await self._lock_idempotency_key(key)
        fingerprint = request_fingerprint(body.model_dump(mode="json"))
        existing = await self.work_order_repo.find_by_idempotency_key(key)
        if existing:
            if existing.request_fingerprint != fingerprint:
                raise WorkOrderConflict("This Idempotency-Key was already used with different work-order data")
            detailed = await self.work_order_repo.get_detailed(existing.id)
            return serialize_work_order(detailed or existing)

        customer = await self.customer_repo.get_by_id(body.customer_id)
        if not customer:
            raise CustomerNotFound()
        vehicle = await self.vehicle_repo.get_by_id(body.vehicle_id)
        if not vehicle:
            raise VehicleNotFound(body.vehicle_id)
        if vehicle.customer_id != customer.id:
            raise WorkOrderValidationError("The selected vehicle does not belong to the selected customer")
        if (
            body.intake_odometer_km is not None
            and body.intake_odometer_km < (vehicle.current_km or 0)
        ):
            raise WorkOrderValidationError("The intake odometer cannot be lower than the vehicle's current odometer")

        appointment = None
        if body.appointment_id:
            appointment = await get_appointment_for_update(
                self.uow.session, self.service_center_id, body.appointment_id
            )
            if not appointment:
                raise AppointmentNotFound()
            if appointment.customer_id != customer.id or appointment.vehicle_id != vehicle.id:
                raise WorkOrderValidationError("The appointment customer and vehicle must match the work order")
            if appointment.status in (AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED):
                raise WorkOrderConflict("A cancelled or completed appointment cannot be linked to a work order")
            if await self.work_order_repo.find_by_appointment(appointment.id):
                raise WorkOrderConflict("This appointment already has a work order")

        assigned_mechanic = None
        if body.assigned_mechanic_user_id:
            assigned_mechanic = await get_user_for_tenant(
                self.uow.session, self.service_center_id, body.assigned_mechanic_user_id
            )
            role = getattr(assigned_mechanic, "role", None)
            if not assigned_mechanic or not role or not role.is_active or role.name != "mechanic":
                raise WorkOrderValidationError("The assigned user must be an active mechanic in this service center")

        if appointment:
            appointment.status = AppointmentStatus.IN_PROGRESS

        try:
            order = await self.work_order_repo.create(
                customer_id=customer.id,
                vehicle_id=vehicle.id,
                appointment_id=appointment.id if appointment else None,
                assigned_mechanic_user_id=assigned_mechanic.id if assigned_mechanic else None,
                created_by_user_id=self.actor.id,
                service_type=body.service_type.strip(),
                customer_concern=body.customer_concern,
                work_performed=None,
                status=WorkOrderStatus.RECEIVED,
                intake_odometer_km=body.intake_odometer_km,
                completion_odometer_km=None,
                actual_cost=None,
                idempotency_key=key,
                request_fingerprint=fingerprint,
                received_at=datetime.now(timezone.utc),
            )
        except IntegrityError as exc:
            raise WorkOrderConflict("The work order or appointment was created by another request") from exc

        order.customer = customer
        order.vehicle = vehicle
        order.appointment = appointment
        order.assigned_mechanic = assigned_mechanic
        order.created_by = self.actor
        self.uow.session.add(AuditLog(
            service_center_id=self.service_center_id,
            actor_user_id=self.actor.id,
            action="work_order.created",
            resource_type="work_order",
            resource_id=order.id,
            context={"appointment_linked": bool(appointment), "status": WorkOrderStatus.RECEIVED},
        ))
        await self.uow.session.flush()
        return serialize_work_order(order)
