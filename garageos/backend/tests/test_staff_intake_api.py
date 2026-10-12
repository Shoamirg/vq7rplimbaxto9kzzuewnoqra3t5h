"""Staff-only creation paths used by the walk-in work-order intake form."""
from types import SimpleNamespace
import uuid

import httpx
import pytest

from app.api.deps import get_current_user, get_tenant_uow
from app.api.v1.endpoints import customers, vehicles
from app.main import app


TENANT_ID = uuid.uuid4()
CUSTOMER_ID = uuid.uuid4()
VEHICLE_ID = uuid.uuid4()
BRAND_ID = uuid.uuid4()
MODEL_ID = uuid.uuid4()


@pytest.fixture
def staff_intake_api(monkeypatch):
    actor = SimpleNamespace(
        id=uuid.uuid4(),
        service_center_id=TENANT_ID,
        is_active=True,
        role=SimpleNamespace(name="receptionist", is_active=True),
    )
    uow = SimpleNamespace(service_center_id=TENANT_ID, session=object())
    calls = []

    class CustomerStub:
        def __init__(self, actual_uow):
            assert actual_uow is uow

        async def create_customer(self, **kwargs):
            calls.append(("customer", kwargs))
            return {"id": str(CUSTOMER_ID), "full_name": kwargs["full_name"], "phone": kwargs["phone"], "email": kwargs["email"]}

    class VehicleStub:
        def __init__(self, actual_uow):
            assert actual_uow is uow

        async def add_vehicle(self, customer_id, data):
            calls.append(("vehicle", customer_id, data))
            return {"id": str(VEHICLE_ID), "customer_id": str(customer_id), "year": data["year"], "current_km": data["current_km"]}

        async def list_catalog(self):
            return [{"id": str(BRAND_ID), "name": "Toyota", "models": [{"id": str(MODEL_ID), "name": "Camry"}]}]

    async def current_user():
        return actor

    async def tenant_uow():
        yield uow

    monkeypatch.setattr(customers, "CustomerService", CustomerStub)
    monkeypatch.setattr(vehicles, "VehicleService", VehicleStub, raising=False)
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_tenant_uow] = tenant_uow
    yield actor, calls
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_tenant_uow, None)


@pytest.mark.asyncio
async def test_reception_can_create_customer_without_setting_telegram_identity(staff_intake_api):
    _, calls = staff_intake_api
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/customers", json={
            "full_name": "  Dilnoza Karimova  ",
            "phone": "+998 90 123 45 67",
        })

    assert response.status_code == 201, response.text
    assert response.json()["id"] == str(CUSTOMER_ID)
    assert calls == [("customer", {
        "service_center_id": TENANT_ID,
        "full_name": "Dilnoza Karimova",
        "phone": "+998 90 123 45 67",
        "email": None,
        "address": None,
    })]


@pytest.mark.asyncio
async def test_customer_create_rejects_telegram_identity_mass_assignment(staff_intake_api):
    _, calls = staff_intake_api
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/customers", json={
            "full_name": "Test Person",
            "telegram_id": 123456,
            "service_center_id": str(uuid.uuid4()),
        })

    assert response.status_code == 422
    assert calls == []


@pytest.mark.asyncio
async def test_customer_create_rejects_invalid_email(staff_intake_api):
    _, calls = staff_intake_api
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/customers", json={
            "full_name": "Test Person",
            "email": "not-an-email",
        })

    assert response.status_code == 422
    assert calls == []


@pytest.mark.asyncio
async def test_mechanic_cannot_create_customers_or_vehicles(staff_intake_api):
    actor, calls = staff_intake_api
    actor.role.name = "mechanic"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        customer_response = await client.post("/api/v1/customers", json={"full_name": "Test Person"})
        vehicle_response = await client.post("/api/v1/vehicles", json={
            "customer_id": str(CUSTOMER_ID), "brand_id": str(BRAND_ID),
            "vehicle_model_id": str(MODEL_ID), "year": 2020,
        })

    assert customer_response.status_code == 403
    assert vehicle_response.status_code == 403
    assert calls == []


@pytest.mark.asyncio
async def test_reception_can_create_vehicle_and_load_catalog(staff_intake_api):
    _, calls = staff_intake_api
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        tenant_override_response = await client.post("/api/v1/vehicles", json={
            "customer_id": str(CUSTOMER_ID), "brand_id": str(BRAND_ID),
            "vehicle_model_id": str(MODEL_ID), "year": 2021,
            "service_center_id": str(uuid.uuid4()),
        })
        assert tenant_override_response.status_code == 422
        assert calls == []
        catalog_response = await client.get("/api/v1/vehicles/catalog")
        create_response = await client.post("/api/v1/vehicles", json={
            "customer_id": str(CUSTOMER_ID), "brand_id": str(BRAND_ID),
            "vehicle_model_id": str(MODEL_ID), "year": 2021,
            "license_plate": "01 A 123 AA", "current_km": 45000,
        })

    assert catalog_response.status_code == 200, catalog_response.text
    assert catalog_response.json()[0]["models"][0]["name"] == "Camry"
    assert create_response.status_code == 201, create_response.text
    assert create_response.json()["id"] == str(VEHICLE_ID)
    assert calls[0][0] == "vehicle"
    assert calls[0][1] == CUSTOMER_ID
    assert calls[0][2]["service_center_id"] == TENANT_ID
    assert calls[0][2]["vehicle_model_id"] == MODEL_ID
