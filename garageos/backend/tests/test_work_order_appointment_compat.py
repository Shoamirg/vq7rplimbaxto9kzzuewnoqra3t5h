"""Compatibility checks for completing appointments linked to work orders."""
from types import SimpleNamespace
from datetime import datetime, timezone
import uuid

import pytest
from unittest.mock import AsyncMock

from app.models.work_order import WorkOrderStatus
from app.services import appointment_service as appointment_module
from app.services.appointment_service import AppointmentService


@pytest.mark.asyncio
async def test_legacy_appointment_complete_delegates_to_ready_for_linked_order(monkeypatch):
    appointment_id = uuid.uuid4()
    order_id = uuid.uuid4()
    linked_order = SimpleNamespace(id=order_id, status=WorkOrderStatus.RECEIVED)
    appointment = SimpleNamespace(id=appointment_id, status="in_progress")
    calls = []

    class WorkOrderRepo:
        def __init__(self, session, service_center_id): pass
        async def find_by_appointment(self, actual_appointment_id):
            assert actual_appointment_id == appointment_id
            return linked_order

    class WorkOrderServiceStub:
        def __init__(self, uow, actor): pass
        async def update_work_order(self, actual_order_id, body):
            calls.append((actual_order_id, body.model_dump(exclude_unset=True)))
            linked_order.status = body.status
            return {"service_record_id": "service-record-1"}

    monkeypatch.setattr(appointment_module, "WorkOrderRepository", WorkOrderRepo)
    monkeypatch.setattr(appointment_module, "WorkOrderService", WorkOrderServiceStub)

    service = object.__new__(AppointmentService)
    service.uow = SimpleNamespace(session=object(), service_center_id=uuid.uuid4())
    service.appointment_repo = SimpleNamespace(get_detailed=AsyncMock(return_value=appointment))
    service.get_appointment = AsyncMock(return_value={"id": str(appointment_id), "status": "completed"})
    actor = SimpleNamespace(id=uuid.uuid4())

    result = await service.complete_appointment(
        appointment_id, actor=actor, odometer_km=50100,
        total_cost=225.0, notes="Replaced brake pads",
    )

    assert [body["status"] for _, body in calls] == ["in_progress", "ready"]
    assert calls[0][1]["work_performed"] == "Replaced brake pads"
    assert calls[0][1]["completion_odometer_km"] == 50100
    assert calls[0][1]["actual_cost"] == 225.0
    assert result["work_order_id"] == str(order_id)
    assert result["service_record_id"] == "service-record-1"


@pytest.mark.asyncio
async def test_cancelling_linked_received_appointment_keeps_reserved_slot(monkeypatch):
    appointment_id = uuid.uuid4()
    order_id = uuid.uuid4()
    slot = SimpleNamespace(status="booked", appointment_id=appointment_id)
    appointment = SimpleNamespace(id=appointment_id, status="in_progress", slot=slot, notes=None)
    linked_order = SimpleNamespace(id=order_id, status=WorkOrderStatus.RECEIVED)
    calls = []

    class WorkOrderRepo:
        def __init__(self, session, service_center_id): pass
        async def find_by_appointment(self, actual_appointment_id): return linked_order

    class WorkOrderServiceStub:
        def __init__(self, uow, actor): pass
        async def update_work_order(self, actual_order_id, body):
            calls.append((actual_order_id, body.model_dump(exclude_unset=True)))
            linked_order.status = body.status
            appointment.status = "cancelled"
            return {"id": str(order_id), "status": "cancelled"}

    monkeypatch.setattr(appointment_module, "WorkOrderRepository", WorkOrderRepo)
    monkeypatch.setattr(appointment_module, "WorkOrderService", WorkOrderServiceStub)
    service = object.__new__(AppointmentService)
    service.uow = SimpleNamespace(session=object(), service_center_id=uuid.uuid4())
    service.appointment_repo = SimpleNamespace(
        get_with_slot_for_update=AsyncMock(return_value=appointment)
    )
    service.get_appointment = AsyncMock(return_value={"id": str(appointment_id), "status": "cancelled"})

    result = await service.cancel_appointment(
        appointment_id, reason="Customer cancelled", actor=SimpleNamespace(id=uuid.uuid4()),
    )

    assert calls == [(order_id, {"status": "cancelled"})]
    assert result["status"] == "cancelled"
    assert appointment.notes == "Customer cancelled"
    assert slot.status == "booked"
    assert slot.appointment_id == appointment_id


@pytest.mark.asyncio
async def test_unlinked_legacy_appointment_keeps_existing_completion_behavior(monkeypatch):
    appointment_id = uuid.uuid4()
    vehicle = SimpleNamespace(
        id=uuid.uuid4(), current_km=42000, vehicle_model=None, license_plate="01 A 123 AA",
    )
    appointment = SimpleNamespace(
        id=appointment_id, customer_id=uuid.uuid4(), customer=SimpleNamespace(full_name="Test Customer"),
        vehicle_id=vehicle.id, vehicle=vehicle, maintenance_rule=None,
        appointment_date=datetime.now(timezone.utc), appointment_time="10:00",
        mechanic_name=None, maintenance_rule_id=None, estimated_duration_minutes=60,
        status="confirmed", notes=None, total_cost=None,
    )
    record_id = uuid.uuid4()
    created_records = []
    events = []

    class WorkOrderRepo:
        def __init__(self, session, service_center_id): pass
        async def find_by_appointment(self, actual_appointment_id): return None

    class Maintenance:
        def __init__(self, session, service_center_id): pass
        async def calculate_due_services(self, vehicle_id):
            return SimpleNamespace(overall_score=91)
        def get_due_events(self, report): return []

    async def create_record(**values):
        created_records.append(values)
        return SimpleNamespace(id=record_id)

    async def flush(): return None

    monkeypatch.setattr(appointment_module, "WorkOrderRepository", WorkOrderRepo)
    monkeypatch.setattr(appointment_module, "MaintenanceService", Maintenance)
    service = object.__new__(AppointmentService)
    service.uow = SimpleNamespace(
        session=SimpleNamespace(flush=flush), service_center_id=uuid.uuid4(),
        add_event=events.append, flush=flush,
    )
    service.appointment_repo = SimpleNamespace(get_detailed=AsyncMock(return_value=appointment))
    service.service_record_repo = SimpleNamespace(create=create_record)

    result = await service.complete_appointment(
        appointment_id, odometer_km=42300, total_cost=180.0, notes="Oil and filter change",
    )

    assert appointment.status == "completed"
    assert appointment.notes == "Oil and filter change"
    assert vehicle.current_km == 42300
    assert created_records[0]["appointment_id"] == appointment_id
    assert created_records[0]["performed_km"] == 42300
    assert created_records[0]["cost"] == 180.0
    assert result["service_record_id"] == str(record_id)
    assert result["vehicle_health_score"] == 91
