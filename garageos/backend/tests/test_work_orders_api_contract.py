"""HTTP contract tests for the work-order create endpoint."""
from types import SimpleNamespace
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_tenant_uow
from app.api.v1.endpoints import work_orders
from app.models.customer import Customer
from app.models.role import Role
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.work_order import WorkOrder
from app.main import app
from app.repositories.unit_of_work import UnitOfWork


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

        async def update_work_order(self, work_order_id, body):
            calls.append(("patch", work_order_id, body.model_dump(exclude_unset=True)))
            item = response_item(work_order_id)
            item["status"] = body.status or "received"
            return item

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


@pytest.mark.asyncio
async def test_work_order_patch_forwards_validated_fields(authorized_work_order_api):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/api/v1/work-orders/{ORDER_ID}",
            json={"status": "in_progress", "work_performed": "Started inspection"},
        )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_progress"
    assert authorized_work_order_api == [(
        "patch", ORDER_ID, {"status": "in_progress", "work_performed": "Started inspection"},
    )]


@pytest.mark.asyncio
async def test_work_order_patch_rejects_intake_changes_after_start(session):
    actor = await session.scalar(
        select(User)
        .options(selectinload(User.role))
        .where(User.email == "admin@demo.garageos.app", User.is_active.is_(True))
    )
    assert actor is not None and actor.role and actor.role.is_active
    vehicle = await session.scalar(
        select(Vehicle).where(
            Vehicle.service_center_id == actor.service_center_id,
            Vehicle.is_active.is_(True),
        ).limit(1)
    )
    assert vehicle is not None
    customer = await session.scalar(
        select(Customer).where(
            Customer.id == vehicle.customer_id,
            Customer.service_center_id == actor.service_center_id,
            Customer.is_active.is_(True),
        )
    )
    assert customer is not None
    mechanic = await session.scalar(
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(
            User.service_center_id == actor.service_center_id,
            User.is_active.is_(True),
            Role.name == "mechanic",
            Role.is_active.is_(True),
        )
        .limit(1)
    )
    assert mechanic is not None

    uow = UnitOfWork(service_center_id=actor.service_center_id)
    uow.session = session

    async def current_user():
        return actor

    async def tenant_uow():
        yield uow

    previous_current_user = app.dependency_overrides.get(get_current_user)
    previous_tenant_uow = app.dependency_overrides.get(get_tenant_uow)
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_tenant_uow] = tenant_uow
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/v1/work-orders",
                headers={"Idempotency-Key": f"intake-policy-{uuid.uuid4()}"},
                json={
                    "customer_id": str(customer.id),
                    "vehicle_id": str(vehicle.id),
                    "service_type": "Intake policy integration test",
                },
            )
            assert created.status_code == 201, created.text
            order_id = created.json()["id"]

            started = await client.patch(
                f"/api/v1/work-orders/{order_id}", json={"status": "in_progress"},
            )
            assert started.status_code == 200, started.text

            for payload in (
                {"customer_concern": "Attempted post-start edit"},
                {"assigned_mechanic_user_id": str(mechanic.id)},
            ):
                rejected = await client.patch(f"/api/v1/work-orders/{order_id}", json=payload)
                assert rejected.status_code == 409, rejected.text

        order = await session.get(WorkOrder, uuid.UUID(order_id))
        assert order is not None
        assert order.customer_concern is None
        assert order.assigned_mechanic_user_id is None
    finally:
        if previous_current_user is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = previous_current_user
        if previous_tenant_uow is None:
            app.dependency_overrides.pop(get_tenant_uow, None)
        else:
            app.dependency_overrides[get_tenant_uow] = previous_tenant_uow
