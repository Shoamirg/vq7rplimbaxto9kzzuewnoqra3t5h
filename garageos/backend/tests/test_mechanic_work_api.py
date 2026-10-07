"""Account-based assignments through authenticated HTTP and real PostgreSQL."""
import uuid

import pytest_asyncio
import pytest
from sqlalchemy import delete, select, update

from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import Appointment, Brand, Role, ServiceCenter, User, VehicleModel
from tests.test_staff_access_lifecycle import PASSWORD, _as_role, client, identity


@pytest_asyncio.fixture
async def workshop(client, identity):
    await _as_role(identity, "admin")
    tag = uuid.uuid4().hex
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == "mechanic"))
        if not role:
            role = Role(name="mechanic")
            session.add(role)
            await session.flush()
        foreign = ServiceCenter(name=f"Foreign mechanic {tag}")
        brand = Brand(name=f"Mechanic-test-{tag}")
        session.add_all([foreign, brand])
        await session.flush()
        model = VehicleModel(brand_id=brand.id, name="Cobalt")
        session.add(model)
        await session.flush()
        users = [User(service_center_id=center, role_id=role.id,
                      email=f"mechanic-{tag}-{i}@example.com", full_name="Sherzod",
                      password_hash=hash_password(PASSWORD))
                 for i, center in enumerate([identity["center"], identity["center"], foreign.id])]
        session.add_all(users)
        await session.commit()
        ids = [str(user.id) for user in users]
        emails = [user.email for user in users]
        foreign_id = foreign.id
        brand_id, model_id = brand.id, str(model.id)
        mechanic_role_id = role.id
    async def login(email):
        response = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    try:
        yield {"ids": ids, "role": mechanic_role_id, "model": model_id, "admin": await login(identity["email"]),
               "mechanics": [await login(email) for email in emails]}
    finally:
        async with async_session_factory() as session:
            await session.execute(update(Role).where(Role.id == mechanic_role_id).values(is_active=True))
            await session.execute(delete(User).where(User.id.in_([uuid.UUID(id) for id in ids])))
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id.in_([foreign_id, identity["center"]])))
            await session.execute(delete(Brand).where(Brand.id == brand_id))
            await session.commit()
        await engine.dispose()


async def test_operator_roster_lists_real_own_mechanics_with_distinct_ids(client, workshop):
    response = await client.get("/api/v1/mechanics", headers=workshop["admin"])
    assert response.status_code == 200, response.text
    assert {item["id"] for item in response.json()["items"]} == set(workshop["ids"][:2])
    assert [item["full_name"] for item in response.json()["items"]] == ["Sherzod", "Sherzod"]


async def booking_body(client, workshop):
    job = await create_job(client, workshop)
    existing = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    return {"customer_id": existing["customer_id"], "vehicle_id": existing["vehicle_id"],
            "appointment_date": "2030-05-02", "appointment_time": "10:00"}


async def test_booking_assigns_selected_account_and_keeps_equal_names_independent(client, workshop):
    body = await booking_body(client, workshop)
    jobs = []
    for uid in workshop["ids"][:2]:
        response = await client.post("/api/v1/appointments/direct", headers=workshop["admin"],
                                     json={**body, "mechanic_user_id": uid})
        assert response.status_code == 201, response.text
        assert response.json()["mechanic_user_id"] == uid
        assert response.json()["mechanic_name"] == "Sherzod"
        jobs.append(response.json()["id"])
    for headers, job in zip(workshop["mechanics"][:2], jobs):
        mine = (await client.get("/api/v1/mechanic/work", headers=headers)).json()
        assert [row["id"] for row in mine["items"]] == [job]
    duplicate = await client.post("/api/v1/appointments/direct", headers=workshop["admin"],
                                  json={**body, "mechanic_user_id": workshop["ids"][0]})
    assert duplicate.status_code == 409, duplicate.text
    adjacent = await client.post("/api/v1/appointments/direct", headers=workshop["admin"],
                                 json={**body, "appointment_time": "11:00", "mechanic_user_id": workshop["ids"][0]})
    assert adjacent.status_code == 201, adjacent.text


@pytest.mark.parametrize("target", ["foreign", "missing", "admin", "inactive", "role_inactive", "ambiguous"])
async def test_booking_rejects_invalid_mechanic_without_creating_job(client, workshop, identity, target):
    body = await booking_body(client, workshop)
    uid = {"foreign": workshop["ids"][2], "missing": str(uuid.uuid4()),
           "admin": str(identity["user"])}.get(target, workshop["ids"][0])
    if target in ("inactive", "role_inactive"):
        async with async_session_factory() as session:
            if target == "inactive":
                await session.execute(update(User).where(User.id == uuid.UUID(uid)).values(is_active=False))
            else:
                await session.execute(update(Role).where(Role.id == workshop["role"]).values(is_active=False))
            await session.commit()
    payload = {**body, "mechanic_user_id": uid}
    if target == "ambiguous":
        payload["mechanic_name"] = "Someone else"
    before = (await client.get("/api/v1/appointments", headers=workshop["admin"])).json()["total"]
    result = await client.post("/api/v1/appointments/direct", headers=workshop["admin"], json=payload)
    assert result.status_code == (422 if target == "ambiguous" else 404), result.text
    after = (await client.get("/api/v1/appointments", headers=workshop["admin"])).json()["total"]
    assert after == before


async def test_booking_keeps_legacy_name_unlinked_and_busy_for_matching_accounts(client, workshop):
    body = await booking_body(client, workshop)
    legacy = await client.post("/api/v1/appointments/direct", headers=workshop["admin"],
                               json={**body, "mechanic_name": " Sherzod "})
    assert legacy.status_code == 201
    assert legacy.json()["mechanic_user_id"] is None
    for uid in workshop["ids"][:2]:
        conflict = await client.post("/api/v1/appointments/direct", headers=workshop["admin"],
                                     json={**body, "mechanic_user_id": uid})
        assert conflict.status_code == 409, conflict.text
    for headers in workshop["mechanics"][:2]:
        assert (await client.get("/api/v1/mechanic/work", headers=headers)).json()["items"] == []


async def create_job(client, workshop, time="10:00"):
    headers = workshop["admin"]
    owner = await client.post("/api/v1/customers", headers=headers,
                              json={"full_name": "Assigned customer", "phone": f"+99890{uuid.uuid4().int % 10000000:07}"})
    assert owner.status_code == 201, owner.text
    car = await client.post("/api/v1/vehicles", headers=headers,
                            json={"customer_id": owner.json()["id"],
                                  "vehicle_model_id": workshop["model"], "year": 2024,
                                  "license_plate": uuid.uuid4().hex[:10].upper()})
    assert car.status_code == 201, car.text
    job = await client.post("/api/v1/appointments/direct", headers=headers, json={
        "customer_id": owner.json()["id"], "vehicle_id": car.json()["id"],
        "appointment_date": "2030-05-01", "appointment_time": time,
    })
    assert job.status_code == 201, job.text
    return job.json()["id"]


async def test_admin_assigns_account_and_mechanic_sees_only_that_job(client, workshop):
    job = await create_job(client, workshop)
    assigned = await client.patch(f"/api/v1/appointments/{job}/assign-mechanic",
        headers=workshop["admin"], json={"mechanic_user_id": workshop["ids"][0]})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["mechanic_user_id"] == workshop["ids"][0]
    assert assigned.json()["mechanic_name"] == "Sherzod"
    mine = await client.get("/api/v1/mechanic/work", headers=workshop["mechanics"][0])
    assert mine.status_code == 200, mine.text
    assert [item["id"] for item in mine.json()["items"]] == [job]
    for headers in workshop["mechanics"][1:]:
        other = await client.get("/api/v1/mechanic/work", headers=headers)
        assert other.status_code == 200, other.text
        assert other.json()["items"] == []
        detail = await client.get(f"/api/v1/mechanic/work/{job}", headers=headers)
        assert detail.status_code == 404, detail.text


async def test_mechanic_completes_own_work_without_staff_or_money_permissions(client, workshop):
    job = await create_job(client, workshop)
    admin, mechanic = workshop["admin"], workshop["mechanics"][0]
    assert (await client.patch(f"/api/v1/appointments/{job}/assign-mechanic", headers=admin,
                              json={"mechanic_user_id": workshop["ids"][0]})).status_code == 200
    assert (await client.patch(f"/api/v1/appointments/{job}/confirm", headers=admin)).status_code == 200
    started = await client.patch(f"/api/v1/mechanic/work/{job}/start", headers=mechanic)
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress"
    assert "total_cost" not in started.json()
    for path in ("customers", "invoices", "appointments", "mechanics"):
        assert (await client.get(f"/api/v1/{path}", headers=mechanic)).status_code == 403
    cost = await client.patch(f"/api/v1/mechanic/work/{job}/complete", headers=mechanic,
                             json={"total_cost": 100})
    assert cost.status_code == 422
    # Existing operator pricing must survive completion by a non-financial actor.
    async with async_session_factory() as session:
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(job)).values(total_cost=125000))
        await session.commit()
    completed = await client.patch(f"/api/v1/mechanic/work/{job}/complete", headers=mechanic,
                                   json={"notes": "Tormoz tekshirildi", "service_type": "Diagnostika"})
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"
    assert completed.json()["notes"] == "Tormoz tekshirildi"
    assert "total_cost" not in completed.json()
    repeated = await client.patch(f"/api/v1/mechanic/work/{job}/complete", headers=mechanic, json={})
    assert repeated.status_code == 409
    current = (await client.get(f"/api/v1/appointments/{job}", headers=admin)).json()
    assert current["status"] == "completed"
    assert current["total_cost"] == 125000


async def test_equal_names_keep_independent_schedules_and_reassignment_revokes_access(client, workshop):
    first, second = await create_job(client, workshop), await create_job(client, workshop)
    for job, uid in zip([first, second], workshop["ids"][:2]):
        assigned = await client.patch(f"/api/v1/appointments/{job}/assign-mechanic", headers=workshop["admin"],
                                     json={"mechanic_user_id": uid})
        assert assigned.status_code == 200, assigned.text
    cleared = await client.patch(f"/api/v1/appointments/{first}", headers=workshop["admin"],
                                 json={"mechanic_name": "Legacy someone"})
    assert cleared.status_code == 200
    assert cleared.json()["mechanic_user_id"] is None
    old = workshop["mechanics"][0]
    assert (await client.get(f"/api/v1/mechanic/work/{first}", headers=old)).status_code == 404
    assert (await client.patch(f"/api/v1/mechanic/work/{first}/start", headers=old)).status_code == 404
    assert (await client.patch(f"/api/v1/mechanic/work/{first}/complete", headers=old, json={})).status_code == 404


async def test_admin_web_edit_links_account_and_preserves_it_on_time_edit(client, workshop):
    job = await create_job(client, workshop)
    assigned = await client.patch(f"/api/v1/appointments/{job}", headers=workshop["admin"],
                                 json={"mechanic_user_id": workshop["ids"][0]})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["mechanic_user_id"] == workshop["ids"][0]
    moved = await client.patch(f"/api/v1/appointments/{job}", headers=workshop["admin"],
                              json={"appointment_time": "12:30"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["mechanic_user_id"] == workshop["ids"][0]


@pytest.mark.parametrize("target", ["foreign", "missing", "admin", "inactive"])
async def test_assignment_rejects_accounts_outside_active_own_mechanics(client, workshop, identity, target):
    job = await create_job(client, workshop)
    uid = {"foreign": workshop["ids"][2], "missing": str(uuid.uuid4()),
           "admin": str(identity["user"]), "inactive": workshop["ids"][0]}[target]
    if target == "inactive":
        async with async_session_factory() as session:
            await session.execute(update(User).where(User.id == uuid.UUID(uid)).values(is_active=False))
            await session.commit()
    for path in ("", "/assign-mechanic"):
        result = await client.patch(f"/api/v1/appointments/{job}{path}", headers=workshop["admin"],
                                    json={"mechanic_user_id": uid})
        assert result.status_code == 404, result.text
    current = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    assert current["mechanic_user_id"] is None
    assert current["mechanic_name"] is None


async def test_legacy_name_never_grants_account_ownership_and_queries_are_bounded(client, workshop):
    job = await create_job(client, workshop)
    assigned = await client.patch(f"/api/v1/appointments/{job}/assign-mechanic", headers=workshop["admin"],
                                 json={"mechanic_name": "Sherzod"})
    assert assigned.status_code == 200
    for headers in workshop["mechanics"]:
        result = await client.get("/api/v1/mechanic/work", headers=headers)
        assert result.json()["items"] == []
    for params in [{"page": 0}, {"page": 2147483648}, {"page_size": 101}, {"q": "a" * 101}]:
        assert (await client.get("/api/v1/mechanic/work", params=params, headers=workshop["mechanics"][0])).status_code == 422
    assert (await client.get("/api/v1/mechanic/work", headers=workshop["admin"])).status_code == 403
    assert (await client.get("/api/v1/mechanic/work")).status_code == 401
