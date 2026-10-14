import pytest

from app.core.config import settings
from app.core.idempotency import execute_idempotent, request_fingerprint, require_idempotency_key
from app.exceptions import IdempotencyKeyRequired
from app.repositories.unit_of_work import UnitOfWork


def test_request_fingerprint_is_order_independent_and_operation_scoped():
    assert request_fingerprint("booking.v1", {"a": 1, "b": 2}) == request_fingerprint(
        "booking.v1", {"b": 2, "a": 1},
    )
    assert request_fingerprint("booking.v1", {"a": 1}) != request_fingerprint(
        "another-operation.v1", {"a": 1},
    )
    assert request_fingerprint("booking.v1", {"a": 1}) != request_fingerprint(
        "booking.v1", {"a": 2},
    )


@pytest.mark.asyncio
async def test_production_booking_rejects_missing_idempotency_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(IdempotencyKeyRequired):
        require_idempotency_key(None)

    async def should_not_run():
        raise AssertionError("A production booking without a key must not run")

    with pytest.raises(IdempotencyKeyRequired):
        await execute_idempotent(
            UnitOfWork(service_center_id=None),
            key=None,
            operation="staff.direct-appointment.create.v1",
            request={"customer_id": "customer"},
            execute=should_not_run,
        )


@pytest.mark.asyncio
async def test_development_booking_without_key_keeps_internal_dev_flow(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    called = False

    async def create():
        nonlocal called
        called = True
        return {"id": "demo"}

    result = await execute_idempotent(
        UnitOfWork(service_center_id=None),
        key=None,
        operation="staff.direct-appointment.create.v1",
        request={"customer_id": "customer"},
        execute=create,
    )
    assert called and result == {"id": "demo"}
