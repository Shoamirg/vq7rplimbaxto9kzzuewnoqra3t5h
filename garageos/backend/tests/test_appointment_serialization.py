"""Appointment lists expose a lightweight link to an existing repair order."""
from datetime import datetime, timezone
from types import SimpleNamespace
import uuid

from app.services.appointment_service import serialize_appointment


def make_appointment(work_order=None):
    return SimpleNamespace(
        id=uuid.uuid4(), customer_id=uuid.uuid4(),
        customer=SimpleNamespace(full_name="Example Customer"),
        vehicle_id=uuid.uuid4(), vehicle=SimpleNamespace(vehicle_model=None, license_plate=None),
        appointment_date=datetime.now(timezone.utc), appointment_time="09:00",
        mechanic_name=None, status="confirmed", maintenance_rule_id=None,
        maintenance_rule=None, estimated_duration_minutes=60, total_cost=None,
        work_order=work_order,
    )


def test_appointment_serialization_includes_linked_work_order_status():
    order_id = uuid.uuid4()

    result = serialize_appointment(make_appointment(
        SimpleNamespace(id=order_id, status="in_progress")
    ))

    assert result["work_order_id"] == str(order_id)
    assert result["work_order_status"] == "in_progress"


def test_appointment_without_work_order_serializes_empty_link():
    result = serialize_appointment(make_appointment())

    assert result["work_order_id"] is None
    assert result["work_order_status"] is None
