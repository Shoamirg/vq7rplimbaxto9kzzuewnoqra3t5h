"""Case entry points use real staff identities and migrated PostgreSQL.

Legacy fixtures keep foreign keys enabled. Only event delivery is recorded;
authentication, tenant dependencies, transactions and serialization are real.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import func, select, update

from app.core.database import async_session_factory
from app.core.config import settings
from app.core.events import event_bus
from app.models import Customer, Role, User, Vehicle
from app.models.conversation import Attachment, Conversation, Message, Participant
from app.models.notification import Notification
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_mechanic_work_api import create_job, workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401
from tests.test_transaction_response_api import Operation, send_observed


@pytest_asyncio.fixture
async def references(client, workshop, identity):
    job = await create_job(client, workshop)
    detail = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    async with async_session_factory() as session:
        foreign_user = await session.get(User, uuid.UUID(workshop["ids"][2]))
        foreign = Customer(service_center_id=foreign_user.service_center_id, full_name="FOREIGN-PRIVATE")
        other = Customer(service_center_id=identity["center"], full_name="Other local owner")
        session.add_all([foreign, other])
        await session.flush()
        vehicle = Vehicle(service_center_id=foreign.service_center_id, customer_id=foreign.id,
                          vehicle_model_id=uuid.UUID(workshop["model"]), year=2024)
        session.add(vehicle)
        await session.commit()
        return PrivateWorkshop(workshop, customer=detail["customer_id"], vehicle=detail["vehicle_id"], appointment=job,
                               foreign_customer=str(foreign.id), foreign_vehicle=str(vehicle.id),
                               other_customer=str(other.id), foreign_center=foreign.service_center_id,
                               center=identity["center"])


async def snapshot(refs):
    async with async_session_factory() as session:
        counts = tuple([await session.scalar(select(func.count()).select_from(model).where(
            model.service_center_id.in_([refs["center"], refs["foreign_center"]])))
            for model in [OperationalCase, Conversation, Participant, Message, Attachment, Notification]])
        cases = tuple((await session.execute(select(
            OperationalCase.id, OperationalCase.status, OperationalCase.assigned_user_id,
        ).where(OperationalCase.service_center_id == refs["center"]).order_by(OperationalCase.id))).all())
        return counts, cases


async def open_case(client, refs):
    result = await client.post("/api/v1/cases", headers=refs["admin"], json={
        "customer_id": refs["customer"], "vehicle_id": refs["vehicle"], "title": "Local assistance",
    })
    assert result.status_code == 201, result.text
    return result.json()["id"]


async def open_thread(client, refs, case):
    response = await client.get(f"/api/v1/cases/{case}/conversation", headers=refs["admin"])
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("target", ["foreign_customer", "missing_customer", "inactive_customer",
                                  "foreign_vehicle", "missing_vehicle", "inactive_vehicle", "wrong_owner"])
async def test_create_rejects_unsafe_references_without_side_effects(client, references, monkeypatch, target):
    refs = references
    body = {"customer_id": refs["customer"], "vehicle_id": refs["vehicle"], "title": "Rejected"}
    if target.startswith("foreign_"):
        body[target.removeprefix("foreign_") + "_id"] = refs[target]
    elif target.startswith("missing_"):
        body[target.removeprefix("missing_") + "_id"] = str(uuid.uuid4())
    elif target == "wrong_owner":
        body["customer_id"] = refs["other_customer"]
    else:
        model, key = (Customer, "customer") if target.endswith("customer") else (Vehicle, "vehicle")
        async with async_session_factory() as session:
            await session.execute(update(model).where(model.id == uuid.UUID(refs[key])).values(is_active=False))
            await session.commit()
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    response = await client.post("/api/v1/cases", headers=refs["admin"], json=body)
    assert response.status_code == (422 if target == "wrong_owner" else 404), response.text
    assert "FOREIGN-PRIVATE" not in response.text
    assert await snapshot(refs) == before
    assert events == []


@pytest.mark.parametrize("target", ["foreign", "missing", "admin", "inactive", "role_inactive"])
async def test_invalid_assignment_and_status_patch_is_atomic(client, references, identity, monkeypatch, target):
    refs = references
    case = await open_case(client, refs)
    user = {"foreign": refs["ids"][2], "missing": str(uuid.uuid4()), "admin": str(identity["user"])}.get(
        target, refs["ids"][0])
    if target in ("inactive", "role_inactive"):
        model, key = (User, uuid.UUID(user)) if target == "inactive" else (Role, refs["role"])
        async with async_session_factory() as session:
            await session.execute(update(model).where(model.id == key).values(is_active=False))
            await session.commit()
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    result = await client.patch(f"/api/v1/cases/{case}", headers=refs["admin"],
                                json={"assigned_user_id": user, "status": "resolved"})
    assert result.status_code == 404, result.text
    assert await snapshot(refs) == before
    assert events == []


@pytest.mark.parametrize("inactive", ["user", "role"])
async def test_dispatch_roster_only_has_active_own_mechanics(client, references, inactive):
    refs = references
    before = await client.get("/api/v1/cases/mechanics", headers=refs["admin"])
    assert {m["id"] for m in before.json()} == set(refs["ids"][:2])
    model, key = (User, uuid.UUID(refs["ids"][0])) if inactive == "user" else (Role, refs["role"])
    async with async_session_factory() as session:
        await session.execute(update(model).where(model.id == key).values(is_active=False))
        await session.commit()
    after = await client.get("/api/v1/cases/mechanics", headers=refs["admin"])
    assert after.status_code == 200
    assert {m["id"] for m in after.json()} == ({refs["ids"][1]} if inactive == "user" else set())


@pytest.mark.parametrize("legacy", ["customer", "vehicle", "assigned_user", "inactive_case"])
@pytest.mark.parametrize("existing", [False, True])
async def test_unsafe_legacy_case_is_hidden_and_cannot_mutate_or_open_thread(
    client, references, monkeypatch, legacy, existing,
):
    refs = references
    case = await open_case(client, refs)
    if existing:
        await open_thread(client, refs, case)
    values = {"is_active": False} if legacy == "inactive_case" else {
        legacy + "_id": uuid.UUID(refs["ids"][2] if legacy == "assigned_user" else refs["foreign_" + legacy])}
    async with async_session_factory() as session:
        await session.execute(update(OperationalCase).where(OperationalCase.id == uuid.UUID(case)).values(**values))
        await session.commit()
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    listing = await client.get("/api/v1/cases", headers=refs["admin"])
    assert listing.status_code == 200
    assert listing.json()["items"] == [] and listing.json()["active_count"] == 0
    for method, suffix, body in [("GET", "", None), ("GET", "/conversation", None),
                                 ("PATCH", "", {"status": "resolved"})]:
        options = {"headers": refs["admin"]}
        if body is not None:
            options["json"] = body
        result = await client.request(method, f"/api/v1/cases/{case}{suffix}", **options)
        assert result.status_code == 404, result.text
        assert "FOREIGN-PRIVATE" not in result.text
    assert await snapshot(refs) == before
    assert events == []


@pytest.mark.parametrize("field", ["customer", "vehicle", "assigned_user"])
async def test_existing_case_thread_validates_its_own_references(client, references, monkeypatch, field):
    refs = references
    case = await open_case(client, refs)
    thread = await open_thread(client, refs, case)
    key = refs["ids"][2] if field == "assigned_user" else refs["foreign_" + field]
    async with async_session_factory() as session:
        await session.execute(update(Conversation).where(Conversation.id == uuid.UUID(thread["id"])).values(
            **{field + "_id": uuid.UUID(key)}))
        await session.commit()
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    result = await client.get(f"/api/v1/cases/{case}/conversation", headers=refs["admin"])
    assert result.status_code == 404, result.text
    assert "FOREIGN-PRIVATE" not in result.text
    assert await snapshot(refs) == before
    assert events == []


CHILD_GAPS = ["participant_tenant", "participant_customer", "participant_user", "message_tenant",
              "message_author", "attachment_tenant", "attachment_parent", "reverse_attachment_parent"]


@pytest.mark.parametrize("gap", CHILD_GAPS)
async def test_case_thread_rejects_inconsistent_children(client, references, monkeypatch, gap):
    refs = references
    case = await open_case(client, refs)
    thread = await open_thread(client, refs, case)
    tid = uuid.UUID(thread["id"])
    async with async_session_factory() as session:
        if gap.startswith("participant"):
            row = await session.scalar(select(Participant).where(Participant.conversation_id == tid))
            if gap == "participant_tenant":
                row.service_center_id = refs["foreign_center"]
            elif gap == "participant_customer":
                row.customer_id = uuid.UUID(refs["foreign_customer"])
            else:
                row.user_id = uuid.UUID(refs["ids"][2])
            row.display_name = "FOREIGN-PRIVATE"
        elif gap.startswith("message"):
            row = await session.scalar(select(Message).where(Message.conversation_id == tid))
            if gap == "message_tenant":
                row.service_center_id = refs["foreign_center"]
            else:
                row.author_user_id = uuid.UUID(refs["ids"][2])
            row.author_name = "FOREIGN-PRIVATE"
        else:
            message = await session.scalar(select(Message).where(Message.conversation_id == tid))
            attachment_tid, message_id = tid, message.id
            if gap in ("attachment_parent", "reverse_attachment_parent"):
                other = Conversation(service_center_id=refs["center"], subject="Other local thread")
                session.add(other)
                await session.flush()
                other_message = Message(service_center_id=refs["center"], conversation_id=other.id, body="Other")
                session.add(other_message)
                await session.flush()
                if gap == "attachment_parent":
                    message_id = other_message.id
                else:
                    attachment_tid = other.id
            session.add(Attachment(service_center_id=refs["foreign_center"] if gap == "attachment_tenant" else refs["center"],
                                   conversation_id=attachment_tid, message_id=message_id, label="FOREIGN-PRIVATE"))
        await session.commit()
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    response = await client.get(f"/api/v1/cases/{case}/conversation", headers=refs["admin"])
    assert response.status_code == 404, response.text
    assert "FOREIGN-PRIVATE" not in response.text
    assert await snapshot(refs) == before
    assert events == []


@pytest.mark.parametrize("history", ["customer", "vehicle", "assigned_user", "transferred_vehicle", "thread_children"])
async def test_own_historical_relations_stay_readable(client, references, history):
    refs = references
    case = await open_case(client, refs)
    assigned = await client.patch(f"/api/v1/cases/{case}", headers=refs["admin"],
                                  json={"assigned_user_id": refs["ids"][0]})
    assert assigned.status_code == 200
    thread = await open_thread(client, refs, case)
    async with async_session_factory() as session:
        if history == "assigned_user":
            await session.execute(update(Conversation).where(Conversation.id == uuid.UUID(thread["id"])).values(
                assigned_user_id=uuid.UUID(refs["ids"][0])))
            await session.execute(update(Participant).where(Participant.conversation_id == uuid.UUID(thread["id"])).values(
                user_id=uuid.UUID(refs["ids"][0])))
            await session.execute(update(Message).where(Message.conversation_id == uuid.UUID(thread["id"])).values(
                author_user_id=uuid.UUID(refs["ids"][0])))
        if history == "transferred_vehicle":
            await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs["vehicle"])).values(
                customer_id=uuid.UUID(refs["other_customer"])))
        elif history == "thread_children":
            for model in [Participant, Message]:
                await session.execute(update(model).where(model.conversation_id == uuid.UUID(thread["id"])).values(is_active=False))
        else:
            model, key = {"customer": (Customer, refs["customer"]), "vehicle": (Vehicle, refs["vehicle"]),
                          "assigned_user": (User, refs["ids"][0])}[history]
            await session.execute(update(model).where(model.id == uuid.UUID(key)).values(is_active=False))
        await session.commit()
    detail = await client.get(f"/api/v1/cases/{case}", headers=refs["admin"])
    assert detail.status_code == 200, detail.text
    assert detail.json()["customer"]["id"] == refs["customer"]
    result = await client.get(f"/api/v1/cases/{case}/conversation", headers=refs["admin"])
    assert result.status_code == 200, result.text
    assert result.json()["id"] == thread["id"]
    listing = await client.get("/api/v1/cases", headers=refs["admin"])
    assert [c["id"] for c in listing.json()["items"]] == [case]
    assert listing.json()["active_count"] == 1


async def test_valid_case_assignment_and_shared_thread_are_durable_at_first_success_send(client, references, monkeypatch):
    refs = references
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    observations, statuses = [], []
    op = Operation("case", "POST", "/api/v1/cases", refs["admin"],
                   {"customer_id": refs["customer"], "title": "Durable case"}, lambda: snapshot(refs))
    result = await send_observed(op, observations, statuses)
    assert result.status_code == 201
    assert observations == [await snapshot(refs)]
    case = result.json()["id"]
    before = await snapshot(refs)
    observations.clear()
    op = Operation("assignment", "PATCH", f"/api/v1/cases/{case}", refs["admin"],
                   {"assigned_user_id": refs["ids"][0], "status": "in_progress"}, lambda: snapshot(refs), 200)
    result = await send_observed(op, observations, statuses)
    assert result.status_code == 200, result.text
    assert observations == [await snapshot(refs)] and observations[0] != before
    before = await snapshot(refs)
    observations.clear()
    op = Operation("thread", "GET", f"/api/v1/cases/{case}/conversation", refs["admin"], None,
                   lambda: snapshot(refs), 200)
    result = await send_observed(op, observations, statuses)
    assert result.status_code == 200, result.text
    assert observations == [await snapshot(refs)] and observations[0] != before
    second = await open_thread(client, refs, case)
    assert second["id"] == result.json()["id"]
    assert await snapshot(refs) == observations[0]
    assert len(events) >= 4


async def test_case_routes_preserve_real_read_only_and_mechanic_permissions(client, references, identity, monkeypatch):
    refs = references
    case = await open_case(client, refs)
    for headers in refs["mechanics"]:
        assert (await client.get(f"/api/v1/cases/{case}", headers=headers)).status_code == 403
        assert (await client.get(f"/api/v1/cases/{case}/conversation", headers=headers)).status_code == 403
    email = f"case-customer-{uuid.uuid4().hex}@example.com"
    account = await client.post(f"/api/v1/customers/{refs['customer']}/account", headers=refs["admin"],
                                json={"email": email, "password": PASSWORD})
    assert account.status_code == 201, account.text
    signed = await client.post("/api/v1/customer/auth/login", json={"email": email, "password": PASSWORD})
    assert signed.status_code == 200
    customer = PrivateWorkshop(headers={"Authorization": "Bearer " + signed.json()["access_token"]})
    before = await snapshot(refs)
    assert (await client.get(f"/api/v1/cases/{case}", headers=customer["headers"])).status_code == 401
    assert (await client.get(f"/api/v1/cases/{case}/conversation", headers=customer["headers"])).status_code == 401
    assert (await client.patch(f"/api/v1/cases/{case}", headers=customer["headers"], json={"status": "resolved"})).status_code == 401
    assert await snapshot(refs) == before
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
    login = await client.post("/api/v1/auth/demo")
    assert login.status_code == 200
    private = PrivateWorkshop(headers={"Authorization": "Bearer " + login.json()["access_token"]})
    assert (await client.get(f"/api/v1/cases/{case}", headers=private["headers"])).status_code == 200
    assert (await client.get(f"/api/v1/cases/{case}/conversation", headers=private["headers"])).status_code == 403
    assert (await client.patch(f"/api/v1/cases/{case}", headers=private["headers"], json={"status": "resolved"})).status_code == 403
    thread = await open_thread(client, refs, case)
    read = await client.get(f"/api/v1/cases/{case}/conversation", headers=private["headers"])
    assert read.status_code == 200 and read.json()["id"] == thread["id"]
