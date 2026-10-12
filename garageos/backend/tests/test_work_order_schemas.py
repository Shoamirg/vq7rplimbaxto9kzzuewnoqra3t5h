"""Validation tests for the work-order API contract."""
import uuid

import pytest
from pydantic import ValidationError

from app.schemas.work_order import WorkOrderCreateRequest, WorkOrderUpdateRequest


def test_create_request_requires_customer_vehicle_and_service_type():
    with pytest.raises(ValidationError):
        WorkOrderCreateRequest(customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4())


def test_create_request_rejects_blank_service_type():
    with pytest.raises(ValidationError):
        WorkOrderCreateRequest(
            customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4(), service_type="   ",
        )


def test_create_request_rejects_negative_odometer_and_tenant_override():
    with pytest.raises(ValidationError):
        WorkOrderCreateRequest(
            customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4(),
            service_type="Oil change", intake_odometer_km=-1,
        )
    with pytest.raises(ValidationError):
        WorkOrderCreateRequest(
            customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4(), service_type="Oil change",
            service_center_id=uuid.uuid4(),
        )


def test_patch_requires_a_mutable_field_and_rejects_entity_relinking():
    with pytest.raises(ValidationError):
        WorkOrderUpdateRequest()
    with pytest.raises(ValidationError):
        WorkOrderUpdateRequest(customer_id=uuid.uuid4())


def test_patch_accepts_only_valid_work_order_fields():
    body = WorkOrderUpdateRequest(work_performed="Changed oil", status="ready", actual_cost=42.5)
    assert body.work_performed == "Changed oil"
    assert body.status == "ready"
    assert body.actual_cost == 42.5
