"""Invoice history through authenticated HTTP against the migrated database."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest_asyncio
import pytest
from sqlalchemy import delete, select, update

from app.core.database import async_session_factory
from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.models.invoice import Invoice
from tests.test_staff_access_lifecycle import PASSWORD, _as_role, client, identity


@pytest_asyncio.fixture
async def history(identity, client):
    await _as_role(identity, "admin")
    async with async_session_factory() as session:
        customer = Customer(service_center_id=identity["center"], full_name="Archive customer")
        session.add(customer)
        await session.flush()
        session.add_all([
            Invoice(
                id=uuid.UUID(int=i), service_center_id=identity["center"],
                customer_id=customer.id, code=f"INV-HISTORY-{i:03}", kind="invoice",
                status="issued", currency="UZS", total=100, balance=100,
                created_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
            )
            for i in range(1, 86)
        ])
        await session.commit()
    login = await client.post("/api/v1/auth/login", json={"email": identity["email"], "password": PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_staff_can_page_beyond_eighty_invoices_with_stable_equal_timestamp_order(client, history):
    pages = []
    for page, size in [(1, 30), (2, 30), (3, 25)]:
        response = await client.get("/api/v1/invoices", headers=history,
                                    params={"page": page, "page_size": 30})
        assert response.status_code == 200, response.text
        data = response.json()
        assert len(data["items"]) == size
        assert data["total"] == 85 and data["page"] == page
        assert data["page_size"] == 30 and data["total_pages"] == 3
        pages.append([item["code"] for item in data["items"]])
    assert pages[0][0] == "INV-HISTORY-085"
    assert pages[2][-1] == "INV-HISTORY-001"
    assert len(set(code for page in pages for code in page)) == 85
    repeated = await client.get("/api/v1/invoices", headers=history, params={"page": 2, "page_size": 30})
    assert [item["code"] for item in repeated.json()["items"]] == pages[1]
    detail = await client.get(f"/api/v1/invoices/{uuid.UUID(int=1)}", headers=history)
    assert detail.status_code == 200 and detail.json()["code"] == "INV-HISTORY-001"


async def test_invoice_list_can_filter_estimates_by_one_tenant_customer(client, history, identity):
    async with async_session_factory() as session:
        customer = Customer(service_center_id=identity["center"], full_name="Estimate filter customer")
        session.add(customer)
        await session.flush()
        estimate = Invoice(service_center_id=identity["center"], customer_id=customer.id,
                           code="EST-FILTER-001", kind="estimate", status="draft",
                           currency="UZS", total=125000, balance=125000)
        session.add(estimate)
        await session.commit()
        customer_id, estimate_id = customer.id, estimate.id

    response = await client.get("/api/v1/invoices", headers=history,
                                params={"view": "estimates", "customer_id": str(customer_id)})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1 and [item["id"] for item in data["items"]] == [str(estimate_id)]
    assert data["items"][0]["customer_id"] == str(customer_id)

    empty = await client.get("/api/v1/invoices", headers=history,
                             params={"view": "estimates", "customer_id": str(uuid.uuid4())})
    assert empty.status_code == 200 and empty.json()["total"] == 0 and empty.json()["items"] == []


@pytest_asyncio.fixture
async def searchable_history(history, identity):
    async with async_session_factory() as session:
        customer = await session.scalar(select(Customer).where(Customer.service_center_id == identity["center"]))
        customer.full_name = "Ali Archive"
        brand = Brand(name=f"History-{uuid.uuid4().hex}")
        session.add(brand)
        await session.flush()
        model = VehicleModel(brand_id=brand.id, name="Cobalt")
        session.add(model)
        await session.flush()
        car = Vehicle(service_center_id=identity["center"], customer_id=customer.id,
                      vehicle_model_id=model.id, year=2024, license_plate="01A123BC", vin="HISTORYVIN0000001")
        other = ServiceCenter(name="Other invoice garage")
        session.add_all([car, other])
        await session.flush()
        outsider = Customer(service_center_id=other.id, full_name="Ali Archive")
        session.add(outsider)
        await session.flush()
        await session.execute(update(Invoice).where(Invoice.id == uuid.UUID(int=1)).values(vehicle_id=car.id))
        for center, owner, kind, active, code in [
            (identity["center"], customer.id, "estimate", True, "EST-ARCHIVE"),
            (identity["center"], customer.id, "invoice", False, "INV-ARCHIVE-INACTIVE"),
            (other.id, outsider.id, "invoice", True, "INV-HISTORY-FOREIGN"),
        ]:
            session.add(Invoice(service_center_id=center, customer_id=owner, code=code,
                                kind=kind, is_active=active, status="issued", currency="UZS", total=100, balance=100))
        await session.commit()
        ids = car.id, brand.id, other.id
        label = f"{brand.name} Cobalt"
    try:
        yield history, label
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(Vehicle).where(Vehicle.id == ids[0]))
            await session.execute(delete(Brand).where(Brand.id == ids[1]))
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == ids[2]))
            await session.commit()


async def test_literal_search_finds_old_code_customer_and_vehicle_without_leaking_other_documents(client, searchable_history):
    headers, label = searchable_history
    baseline = (await client.get("/api/v1/invoices", headers=headers)).json()
    assert len(baseline["items"]) == 80 and baseline["total"] == 85
    for query, total in [("history-001", 1), ("aLi aR", 85), ("cobalt", 1),
                         (label.lower(), 1), ("01a123bc", 1), ("historyvin", 1),
                         ("%", 0), ("_", 0), ("/", 0), ("foreign", 0), ("inactive", 0)]:
        response = await client.get("/api/v1/invoices", headers=headers, params={"q": query, "page_size": 30})
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == total, query
        assert result["counts"] == baseline["counts"] and result["kpis"] == baseline["kpis"]
        if total == 1:
            assert result["items"][0]["code"] == "INV-HISTORY-001"
    estimates = await client.get("/api/v1/invoices", headers=headers, params={"view": "estimates", "q": "archive"})
    assert [item["code"] for item in estimates.json()["items"]] == ["EST-ARCHIVE"]


@pytest.mark.parametrize("params", [{"page": 0}, {"page": -1}, {"page": "bad"},
                                  {"page": 2_147_483_648}, {"page": 10**25},
                                  {"page_size": 0}, {"page_size": 101}, {"q": "x" * 101}])
async def test_history_rejects_invalid_query_parameters(client, history, params):
    response = await client.get("/api/v1/invoices", headers=history, params=params)
    assert response.status_code == 422


async def test_literal_wildcards_can_find_a_document_and_empty_pages_remain_bounded(client, history, identity):
    async with async_session_factory() as session:
        await session.execute(update(Invoice).where(Invoice.id == uuid.UUID(int=1)).values(code="INV-50%_SPECIAL"))
        await session.commit()
    for query in ["%", "_", "50%_special"]:
        response = await client.get("/api/v1/invoices", headers=history, params={"q": query})
        assert [item["code"] for item in response.json()["items"]] == ["INV-50%_SPECIAL"]
    empty = (await client.get("/api/v1/invoices", headers=history, params={"page": 4, "page_size": 30})).json()
    assert empty["items"] == [] and empty["total"] == 85 and empty["page"] == 4
    blank = (await client.get("/api/v1/invoices", headers=history, params={"q": "   ", "page_size": 100})).json()
    assert blank["total"] == 85 and len(blank["items"]) == 85


async def test_mechanic_cannot_search_or_archive_financial_history(client, history, identity):
    await _as_role(identity, "mechanic")
    response = await client.get("/api/v1/invoices", headers=history, params={"q": "history-001", "page_size": 30})
    assert response.status_code == 403
    result_id = str(uuid.UUID(int=1))
    denied = await client.delete(f"/api/v1/invoices/{result_id}", headers=history)
    assert denied.status_code == 403
    await _as_role(identity, "admin")
    still_present = await client.get(f"/api/v1/invoices/{result_id}", headers=history)
    assert still_present.status_code == 200
