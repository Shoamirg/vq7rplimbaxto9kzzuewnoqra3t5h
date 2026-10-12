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
from app.models.service_record import ServiceRecord
from app.models.work_order import WorkOrderStatus
from app.core.events import AppointmentCancelled, AppointmentCompleted, MileageUpdated
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.work_order_repository import (
    WorkOrderRepository,
    get_appointment_for_update,
    get_user_for_tenant,
)
from app.schemas.work_order import WorkOrderCreateRequest, WorkOrderUpdateRequest
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

    def _role(self):
        return getattr(self.actor, "role", None)

    def _authorize(self, action: str, order=None) -> None:
        role = self._role()
        require_work_order_action(
            getattr(role, "name", None),
            role_active=bool(role and getattr(role, "is_active", False)),
            action=action,
            actor_user_id=self.actor.id,
            assigned_mechanic_user_id=(order.assigned_mechanic_user_id if order else None),
        )

    async def list_work_orders(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
    ) -> dict:
        self._authorize("list")
        role = self._role()
        assigned_to = self.actor.id if role.name == "mechanic" else None
        rows, total = await self.work_order_repo.list_work_orders(
            skip=(page - 1) * page_size,
            limit=page_size,
            status=status,
            assigned_mechanic_user_id=assigned_to,
        )
        return {
            "items": [serialize_work_order(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if total else 0,
        }

    async def get_work_order(self, work_order_id: uuid.UUID) -> dict:
        order = await self.work_order_repo.get_detailed(work_order_id)
        if not order:
            raise WorkOrderNotFound()
        self._authorize("read", order)
        return serialize_work_order(order)

    async def update_work_order(self, work_order_id: uuid.UUID, body: WorkOrderUpdateRequest) -> dict:
        current = await self.work_order_repo.get_detailed(work_order_id)
        if not current:
            raise WorkOrderNotFound()
        requested_status = body.status or current.status
        if current.appointment_id and requested_status in {
            WorkOrderStatus.READY, WorkOrderStatus.CANCELLED,
        }:
            await get_appointment_for_update(
                self.uow.session, self.service_center_id, current.appointment_id
            )
        order = await self.work_order_repo.get_for_update(work_order_id)
        if not order:
            raise WorkOrderNotFound()

        target_status, mutable_fields = self._authorize_update(order, body)
        if target_status == order.status and not mutable_fields:
            return serialize_work_order(order)

        await self._apply_work_order_fields(order, body)
        previous_status = order.status
        history_created = self._apply_transition(order, target_status)
        changed_fields = sorted(mutable_fields)
        if target_status != previous_status:
            changed_fields.append("status")
        self._audit_update(order, previous_status, target_status, changed_fields, history_created)
        await self.uow.session.flush()
        # onupdate=func.now() expires updated_at during flush; reload the full
        # aggregate before synchronous response serialization to avoid async
        # lazy I/O from attribute access.
        updated = await self.work_order_repo.get_detailed(order.id)
        if updated is None:
            raise WorkOrderNotFound()
        return serialize_work_order(updated)

    def _authorize_update(self, order, body: WorkOrderUpdateRequest) -> tuple[str, set[str]]:
        fields = body.model_fields_set
        mutable_fields = fields - {"status"}
        role = self._role()
        role_name = getattr(role, "name", None)
        target_status = body.status or order.status

        if role_name == "mechanic":
            if mutable_fields - {"work_performed"}:
                self._authorize("edit_fields", order)
            if "work_performed" in mutable_fields:
                self._authorize("edit_work", order)
        elif role_name not in {"admin", "manager", "receptionist"}:
            self._authorize("edit_fields", order)

        if order.status in {WorkOrderStatus.READY, WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED} and mutable_fields:
            raise WorkOrderConflict("A ready or closed work order cannot be edited")

        if target_status != order.status:
            transition_action = {
                WorkOrderStatus.IN_PROGRESS: "start",
                WorkOrderStatus.READY: "ready",
                WorkOrderStatus.CANCELLED: "cancel",
                WorkOrderStatus.COMPLETED: "complete",
            }.get(target_status)
            self._authorize(transition_action or "edit_fields", order)
            allowed_transitions = {
                WorkOrderStatus.RECEIVED: {WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED},
                WorkOrderStatus.IN_PROGRESS: {WorkOrderStatus.READY},
                WorkOrderStatus.READY: {WorkOrderStatus.COMPLETED},
                WorkOrderStatus.COMPLETED: set(),
                WorkOrderStatus.CANCELLED: set(),
            }
            if target_status not in allowed_transitions.get(order.status, set()):
                raise WorkOrderConflict(f"Cannot move a work order from '{order.status}' to '{target_status}'")
        elif not mutable_fields:
            self._authorize("read", order)

        if role_name == "mechanic" and "work_performed" in mutable_fields:
            if order.status != WorkOrderStatus.IN_PROGRESS and target_status not in {
                WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.READY,
            }:
                raise WorkOrderConflict("A mechanic can edit work notes only after starting the work")
        return target_status, mutable_fields

    async def _apply_work_order_fields(self, order, body: WorkOrderUpdateRequest) -> None:
        fields = body.model_fields_set
        if "assigned_mechanic_user_id" in fields:
            assigned_mechanic = None
            if body.assigned_mechanic_user_id:
                assigned_mechanic = await get_user_for_tenant(
                    self.uow.session, self.service_center_id, body.assigned_mechanic_user_id
                )
                role = getattr(assigned_mechanic, "role", None)
                if not assigned_mechanic or not role or not role.is_active or role.name != "mechanic":
                    raise WorkOrderValidationError("The assigned user must be an active mechanic in this service center")
            order.assigned_mechanic_user_id = assigned_mechanic.id if assigned_mechanic else None
            order.assigned_mechanic = assigned_mechanic
        for field in ("customer_concern", "work_performed", "actual_cost"):
            if field in fields:
                setattr(order, field, getattr(body, field))
        if "completion_odometer_km" in fields:
            if body.completion_odometer_km is not None:
                minimum_km = max(order.intake_odometer_km or 0, order.vehicle.current_km or 0)
                if body.completion_odometer_km < minimum_km:
                    raise WorkOrderValidationError("The completion odometer cannot decrease")
            order.completion_odometer_km = body.completion_odometer_km

    def _apply_transition(self, order, target_status: str) -> bool:
        if target_status == order.status:
            return False
        now = datetime.now(timezone.utc)
        history_created = False
        if target_status == WorkOrderStatus.IN_PROGRESS:
            order.started_at = now
        elif target_status == WorkOrderStatus.CANCELLED:
            order.cancelled_at = now
            if order.appointment:
                order.appointment.status = AppointmentStatus.CANCELLED
                self.uow.add_event(AppointmentCancelled(
                    aggregate_id=order.appointment_id,
                    appointment_id=order.appointment_id,
                    service_center_id=self.service_center_id,
                ))
        elif target_status == WorkOrderStatus.READY:
            history_created = self._record_completed_service(order, now)
        elif target_status == WorkOrderStatus.COMPLETED:
            order.completed_at = now
        order.status = target_status
        return history_created

    def _record_completed_service(self, order, performed_date: datetime) -> bool:
        if not (order.work_performed and order.work_performed.strip()):
            raise WorkOrderValidationError("Work performed must be recorded before marking the vehicle ready")
        vehicle = order.vehicle
        previous_km = vehicle.current_km or 0
        performed_km = order.completion_odometer_km
        if performed_km is None:
            performed_km = max(order.intake_odometer_km or 0, previous_km)
        if performed_km < max(order.intake_odometer_km or 0, previous_km):
            raise WorkOrderValidationError("The completion odometer cannot decrease")

        order.ready_at = performed_date
        order.completion_odometer_km = performed_km
        if performed_km > previous_km:
            vehicle.current_km = performed_km
            self.uow.add_event(MileageUpdated(
                aggregate_id=vehicle.id, vehicle_id=vehicle.id,
                previous_km=previous_km, new_km=performed_km,
            ))

        record = ServiceRecord(
            id=uuid.uuid4(),
            service_center_id=self.service_center_id,
            vehicle_id=order.vehicle_id,
            appointment_id=order.appointment_id,
            work_order_id=order.id,
            service_type=order.service_type,
            description=order.work_performed,
            performed_km=performed_km,
            performed_date=performed_date,
            cost=order.actual_cost,
        )
        self.uow.session.add(record)
        order.service_record = record
        if order.appointment:
            order.appointment.status = AppointmentStatus.COMPLETED
            order.appointment.total_cost = order.actual_cost
            self.uow.add_event(AppointmentCompleted(
                aggregate_id=order.appointment_id,
                appointment_id=order.appointment_id,
                service_record_id=record.id,
                service_center_id=self.service_center_id,
            ))
        return True

    def _audit_update(self, order, previous_status, target_status, changed_fields, history_created):
        self.uow.session.add(AuditLog(
            service_center_id=self.service_center_id,
            actor_user_id=self.actor.id,
            action="work_order.updated",
            resource_type="work_order",
            resource_id=order.id,
            context={
                "changed_fields": changed_fields,
                "from_status": previous_status,
                "to_status": target_status,
                "service_record_created": history_created,
            },
        ))

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
        # created_by_user_id was persisted above. The auth user belongs to the
        # authentication dependency's session, so do not attach it to this UoW.
        self.uow.session.add(AuditLog(
            service_center_id=self.service_center_id,
            actor_user_id=self.actor.id,
            action="work_order.created",
            resource_type="work_order",
            resource_id=order.id,
            context={"appointment_linked": bool(appointment), "status": WorkOrderStatus.RECEIVED},
        ))
        await self.uow.session.flush()
        # Reload the created aggregate with its response relationships eagerly
        # loaded; async ORM serialization must not trigger lazy database I/O.
        detailed = await self.work_order_repo.get_detailed(order.id)
        if detailed is None:
            raise WorkOrderNotFound()
        return serialize_work_order(detailed)
