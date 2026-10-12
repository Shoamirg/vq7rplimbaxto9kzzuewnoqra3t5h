"""HTTP contract tests for the work-order create endpoint."""
from types import SimpleNamespace
import uuid

import httpx
import pytest

from app.api.deps import get_current_user, get_tenant_uow
from app.api.v1.endpoints import work_orders
from app.main import app


TENANT_ID = uuid.uuid4()
CUSTOMER_ID = uuid.uuid4()
VEHICLE_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()


@pytest.fixture
def authorized_work_order_api(monkeypatch):
    actor = SimpleNamespace(
        id=ACTOR_ID,
        service_center_id=TENANT_ID,
        role=SimpleNamespace(name="admin", is_active=True),
    )
    uow = SimpleNamespace(service_center_id=TENANT_ID)
    calls = []

    class StubService:
        def __init__(self, actual_uow, actual_actor):
            assert actual_uow is uow
            assert actual_actor is actor

        async def create_work_order(self, body, key):
            calls.append((body, key))
            return {
                "id": str(uuid.uuid4()),
                "customer_id": str(body.customer_id),
                "customer_name": "Test Customer",
                "vehicle_id": str(body.vehicle_id),
                "vehicle_summary": "Test Vehicle",
                "status": "received",
            }

    async def current_user():
        return actor

    async def tenant_uow():
        yield uow

    monkeypatch.setattr(work_orders, "WorkOrderService", StubService)
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_tenant_uow] = tenant_uow
    yield calls
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_tenant_uow, None)


@pytest.mark.asyncio
async def test_work_order_create_requires_an_idempotency_key(authorized_work_order_api):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/work-orders", json={
            "customer_id": str(CUSTOMER_ID),
            "vehicle_id": str(VEHICLE_ID),
            "service_type": "Oil change",
        })
    assert response.status_code == 422
    assert authorized_work_order_api == []


@pytest.mark.asyncio
async def test_work_order_create_returns_created_shape_and_forwards_the_key(authorized_work_order_api):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/work-orders",
            headers={"Idempotency-Key": "api-walk-in-1"},
            json={
                "customer_id": str(CUSTOMER_ID),
                "vehicle_id": str(VEHICLE_ID),
                "service_type": "Oil change",
            },
        )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "received"
    assert len(authorized_work_order_api) == 1
    assert authorized_work_order_api[0][1] == "api-walk-in-1"
