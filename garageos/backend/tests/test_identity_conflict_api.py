"""A conflicting database write after intake's precheck still returns HTTP 409."""
from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import text

from app.api.deps import get_tenant_uow
from app.main import app
from app.models import Brand, Customer, ServiceCenter, VehicleModel
from app.repositories.unit_of_work import UnitOfWork


@pytest.mark.parametrize("table,field,code,status", [
    ("customers", "phone", "DUPLICATE_CUSTOMER_PHONE", 409),
    ("vehicles", "license_plate", "DUPLICATE_VEHICLE", 409),
    ("vehicles", "vin", "DUPLICATE_VEHICLE", 409),
    ("customers", None, "INTERNAL_ERROR", 500),
])
async def test_intake_reports_database_identity_conflict_without_leaking_rows(session, table, field, code, status):
    center = ServiceCenter(name="Conflict test")
    brand = Brand(name=f"Conflict-{uuid.uuid4().hex}")
    session.add_all([center, brand])
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Owner")
    model = VehicleModel(brand_id=brand.id, name="Model")
    session.add_all([customer, model])
    await session.flush()

    # At the external database boundary, insert a competing import only when
    # the API starts INSERT. This exercises the constraint after its SELECT
    # precheck, without replacing application collaborators with mocks.
    function = f"identity_conflict_{uuid.uuid4().hex}"
    if table == "customers":
        columns = "id, service_center_id, full_name, phone, loyalty_points, is_active"
        values = "gen_random_uuid(), NEW.service_center_id, 'Private competing owner', NEW.phone, 0, true"
        body = {"full_name": "Reception owner", "phone": "+998901234567"}
    else:
        columns = "id, service_center_id, customer_id, vehicle_model_id, year, license_plate, vin, current_km, is_active"
        values = "gen_random_uuid(), NEW.service_center_id, NEW.customer_id, NEW.vehicle_model_id, NEW.year, NEW.license_plate, NEW.vin, 0, true"
        body = {"customer_id": str(customer.id), "vehicle_model_id": str(model.id),
                "year": 2020, field: "01A123BC" if field == "license_plate" else "JH4KA8260MC000001"}
    statement = ("RAISE EXCEPTION 'Private internal failure' USING ERRCODE = '23502';" if field is None
                 else f"INSERT INTO {table} ({columns}) VALUES ({values});")
    await session.execute(text(f"""
        CREATE FUNCTION {function}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.service_center_id = '{center.id}'::uuid AND pg_trigger_depth() = 1 THEN
                {statement}
            END IF;
            RETURN NEW;
        END $$;
    """))
    await session.execute(text(f"CREATE TRIGGER {function} BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION {function}()"))

    async def dependency():
        # Roll back the failed request's savepoint before the exception handler;
        # unrelated test fixtures and later requests stay usable.
        async with session.begin_nested():
            uow = UnitOfWork(service_center_id=center.id)
            uow.session = session
            yield uow

    app.dependency_overrides[get_tenant_uow] = dependency
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
                                     base_url="http://test") as client:
            response = await client.post(f"/api/v1/{table}", json=body)
            assert response.status_code == status, response.text
            assert response.json()["error"]["code"] == code
            assert "Private competing owner" not in response.text
            assert "INSERT INTO" not in response.text
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)
