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
ORDER_ID = uuid.uuid4()


def response_item(work_order_id=ORDER_ID):
    now = "2026-10-12T12:00:00Z"
    return {
        "id": str(work_order_id),
        "customer_id": str(CUSTOMER_ID),
        "customer_name": "Test Customer",
        "vehicle_id": str(VEHICLE_ID),
        "vehicle_summary": "Test Vehicle",
        "appointment_id": None,
        "assigned_mechanic_user_id": None,
        "assigned_mechanic_name": None,
        "created_by_user_id": str(ACTOR_ID),
        "service_type": "Oil change",
        "customer_concern": None,
        "work_performed": None,
        "status": "received",
        "intake_odometer_km": None,
        "completion_odometer_km": None,
        "actual_cost": None,
        "service_record_id": None,
        "received_at": now,
        "started_at": None,
        "ready_at": None,
        "completed_at": None,
        "cancelled_at": None,
        "created_at": now,
        "updated_at": now,
    }


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
            return response_item()

        async def list_work_orders(self, *, page, page_size, status=None):
            calls.append(("list", page, page_size, status))
            return {"items": [response_item()], "total": 1, "page": page,
                    "page_size": page_size, "total_pages": 1}

        async def get_work_order(self, work_order_id):
            calls.append(("get", work_order_id))
            return response_item(work_order_id)

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


@pytest.mark.asyncio
async def test_work_order_list_forwards_status_and_pagination(authorized_work_order_api):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/work-orders?page=2&page_size=7&status=ready")

    assert response.status_code == 200, response.text
    assert response.json()["page"] == 2
    assert response.json()["page_size"] == 7
    assert authorized_work_order_api == [("list", 2, 7, "ready")]


@pytest.mark.asyncio
async def test_work_order_detail_route_uses_uuid_and_response_contract(authorized_work_order_api):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/v1/work-orders/{ORDER_ID}")

    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(ORDER_ID)
    assert "phone" not in response.json()
    assert "address" not in response.json()
    assert authorized_work_order_api == [("get", ORDER_ID)]
