"""Reception intake and searchable pagination stay within the authenticated garage."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import httpx
from sqlalchemy import select

from app.api.deps import get_tenant_uow
from app.main import app
from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.seeds.brands import seed_brands
from app.seeds.models import seed_vehicle_models


async def _center(session):
    center = ServiceCenter(name="Intake test", email=f"{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    return center


@asynccontextmanager
async def _api(session, center_id):
    async def dependency():
        uow = UnitOfWork(service_center_id=center_id)
        uow.session = session
        yield uow
    app.dependency_overrides[get_tenant_uow] = dependency
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)


async def test_staff_registers_customer_vehicle_and_normalized_duplicates(session):
    center = await _center(session)
    other_center = await _center(session)
    brand = Brand(name=f"Intake-{uuid.uuid4().hex}")
    session.add(brand)
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Test model")
    foreign = Customer(service_center_id=other_center.id, full_name="Foreign customer")
    session.add_all([model, foreign])
    await session.flush()
    async with _api(session, center.id) as client:
        customer = await client.post("/api/v1/customers", json={
            "full_name": "  New owner  ", "phone": "+998 (90) 123-4567", "email": "OWNER@TEST.LOCAL",
        })
        assert customer.status_code == 201, customer.text
        payload = customer.json()
        assert payload["full_name"] == "New owner"
        assert payload["phone"] == "+998901234567"
        assert payload["email"] == "owner@test.local"
        row = await session.get(Customer, uuid.UUID(payload["id"]))
        assert row.service_center_id == center.id
        duplicate = await client.post("/api/v1/customers", json={
            "full_name": "Duplicate", "phone": "998 90 123 45 67",
        })
        assert duplicate.status_code == 409, duplicate.text
        assert duplicate.json()["error"]["code"] == "DUPLICATE_CUSTOMER_PHONE"
        forged_tenant = await client.post("/api/v1/customers", json={
            "full_name": "Forged", "phone": "+998901234568", "service_center_id": str(other_center.id),
        })
        assert forged_tenant.status_code == 422
        assert (await client.post("/api/v1/customers", json={"full_name": " ", "phone": "abc"})).status_code == 422
        vehicle_data = {"customer_id": payload["id"], "vehicle_model_id": str(model.id),
                        "year": 2020, "license_plate": "01 A 123 BC", "current_km": 15000}
        vehicle = await client.post("/api/v1/vehicles", json=vehicle_data)
        assert vehicle.status_code == 201, vehicle.text
        stored = await session.get(Vehicle, uuid.UUID(vehicle.json()["id"]))
        assert stored.service_center_id == center.id and stored.customer_id == row.id
        assert vehicle.json()["license_plate"] == "01A123BC"
        duplicate = await client.post("/api/v1/vehicles", json={**vehicle_data, "license_plate": "01-a123bc"})
        assert duplicate.status_code == 409, duplicate.text
        foreign_owner = await client.post("/api/v1/vehicles", json={**vehicle_data, "customer_id": str(foreign.id), "license_plate": "OTHER"})
        assert foreign_owner.status_code == 404, foreign_owner.text
        unknown_model = await client.post("/api/v1/vehicles", json={**vehicle_data, "vehicle_model_id": str(uuid.uuid4()), "license_plate": "UNKNOWN"})
        assert unknown_model.status_code == 422, unknown_model.text
        assert (await client.post("/api/v1/vehicles", json={**vehicle_data, "current_km": -1})).status_code == 422
        assert (await client.post("/api/v1/vehicles", json={**vehicle_data, "license_plate": None})).status_code == 422
        assert (await client.post("/api/v1/vehicles", json={**vehicle_data, "license_plate": "!!!"})).status_code == 422
        catalog = await client.get("/api/v1/vehicles/catalog")
        assert catalog.status_code == 200, catalog.text
        assert any(item["id"] == str(brand.id) and item["models"][0]["id"] == str(model.id)
                   for item in catalog.json()["brands"])
        listed = await client.get("/api/v1/vehicles", params={"q": "01A123BC"})
        assert listed.json()["total"] == 1
        assert listed.json()["items"][0]["id"] == vehicle.json()["id"]
        assert (await client.get("/api/v1/vehicles", params={"q": "01 A 123 BC"})).json()["total"] == 1
        assert (await client.get("/api/v1/customers", params={"q": "+998 (90) 123-4567"})).json()["total"] == 1


async def test_customer_search_and_pages_cover_more_than_200_customers(session):
    center = await _center(session)
    other_center = await _center(session)
    customers = [Customer(service_center_id=center.id, full_name=f"Customer {n:03d}",
                          phone=f"+9989{n:08d}", email=f"customer-{n}@test.local") for n in range(205)]
    session.add_all(customers)
    session.add(Customer(service_center_id=other_center.id, full_name="Customer 204", email="foreign@test.local"))
    await session.flush()
    async with _api(session, center.id) as client:
        first = (await client.get("/api/v1/customers", params={"limit": 200})).json()
        assert first["count"] == 200 and first["total"] == 205 and first["has_more"]
        last = (await client.get("/api/v1/customers", params={"limit": 200, "offset": 200})).json()
        assert last["count"] == 5 and not last["has_more"]
        assert not set(item["id"] for item in first["items"]) & set(item["id"] for item in last["items"])
        found = (await client.get("/api/v1/customers", params={"q": "customer-204@test.local", "limit": 8})).json()
        assert found["total"] == 1 and found["items"][0]["id"] == str(customers[204].id)
        assert (await client.get("/api/v1/customers", params={"q": "foreign@test.local"})).json()["total"] == 0
        assert (await client.get("/api/v1/customers", params={"offset": -1})).status_code == 422


async def test_catalog_upgrade_adds_common_models_without_duplicate_rows(session):
    brands = await seed_brands(session)
    first = await seed_vehicle_models(session, brands)
    second = await seed_vehicle_models(session, brands)
    assert [model.id for model in first] == [model.id for model in second]
    rows = (await session.execute(select(VehicleModel).where(
        VehicleModel.brand_id == brands["Chevrolet"].id,
        VehicleModel.name.in_(["Cobalt", "Spark", "Nexia", "Gentra", "Damas"]),
    ))).scalars().all()
    assert len(rows) == 5
    assert {model.name for model in rows} == {"Cobalt", "Spark", "Nexia", "Gentra", "Damas"}
