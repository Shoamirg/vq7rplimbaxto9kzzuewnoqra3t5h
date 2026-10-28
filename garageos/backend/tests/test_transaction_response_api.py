"""Observe real PostgreSQL durability at the FIRST HTTP success send.

Completed ASGITransport requests wait for dependency teardown, so they alone
cannot prove this boundary. Auth/transaction dependencies are not overridden.
Only commit faults and event delivery are controlled; all mutations and
independent observations use migrated PostgreSQL.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Awaitable, Callable

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.events import event_bus
from tests.support.auth_sessions import persisted_access
from app.main import app
from app.models import Appointment, Customer, IdempotencyRecord, User
from app.models.appointment_slot import AppointmentSlot
from app.models.audit_log import AuditLog
from app.models.conversation import Conversation, Message, Participant
from app.models.invoice import Invoice, Payment
from app.models.ledger import LedgerEntry
from app.models.operational_case import OperationalCase
from app.repositories.unit_of_work import UnitOfWork
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_mechanic_work_api import create_job, workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401


@dataclass(repr=False)
class Operation:
    family: str
    method: str
    path: str
    headers: dict = field(repr=False)
    body: dict | None = field(repr=False)
    read: Callable[[], Awaitable[tuple]] = field(repr=False)
    success: int = 201

    def __repr__(self):
        return f"<private transaction operation: {self.family}>"


async def send_observed(operation, observations, statuses):
    async def observed_app(scope, receive, send):
        async def observe(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])
                if 200 <= message["status"] < 300:
                    observations.append(await operation.read())
            await send(message)
        await app(scope, receive, observe)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=observed_app, raise_app_exceptions=False),
        base_url="http://test",
    ) as observed:
        options = {"headers": operation.headers}
        if operation.body is not None:
            options["json"] = operation.body
        return await observed.request(operation.method, operation.path, **options)


async def prepare_operation(family, client, workshop, identity):
    admin = workshop["admin"]
    marker = uuid.uuid4().hex
    center = identity["center"]

    if family == "tenant":
        async def read():
            async with async_session_factory() as session:
                return tuple((await session.execute(select(Customer.id, Customer.full_name).where(
                    Customer.service_center_id == center, Customer.full_name == marker))).all())
        return Operation(family, "POST", "/api/v1/customers", admin,
                         {"full_name": marker, "phone": "998" + str(uuid.uuid4().int)[:10]}, read)

    if family == "owner":
        email = f"transaction-{marker}@example.com"
        async def read():
            async with async_session_factory() as session:
                users = tuple((await session.execute(select(User.id, User.full_name).where(
                    User.service_center_id == center, User.email == email))).all())
                audits = await session.scalar(select(func.count()).select_from(AuditLog).where(
                    AuditLog.service_center_id == center, AuditLog.action == "staff.create"))
                return users, audits
        return Operation(family, "POST", "/api/v1/staff", admin,
                         {"full_name": marker, "email": email, "password": PASSWORD, "role": "mechanic"}, read)

    job = await create_job(client, workshop)
    detail = (await client.get(f"/api/v1/appointments/{job}", headers=admin)).json()
    customer = uuid.UUID(detail["customer_id"])

    if family == "mechanic":
        assert (await client.patch(f"/api/v1/appointments/{job}/assign-mechanic", headers=admin,
                                  json={"mechanic_user_id": workshop["ids"][0]})).status_code == 200
        assert (await client.patch(f"/api/v1/appointments/{job}/confirm", headers=admin)).status_code == 200
        async def read():
            async with async_session_factory() as session:
                row = await session.get(Appointment, uuid.UUID(job))
                return row.status, str(row.mechanic_user_id), row.total_cost
        return Operation(family, "PATCH", f"/api/v1/mechanic/work/{job}/start",
                         workshop["mechanics"][0], None, read, 200)

    if family == "payment":
        invoice = await client.post("/api/v1/invoices", headers=admin, json={
            "kind": "invoice", "customer_id": str(customer), "currency": "UZS", "tax_rate": 0,
            "line_items": [{"kind": "labor", "description": "Service", "unit_price": 100}],
        })
        assert invoice.status_code == 201
        invoice_id = uuid.UUID(invoice.json()["id"])
        async def read():
            async with async_session_factory() as session:
                doc = await session.get(Invoice, invoice_id)
                payments = await session.scalar(select(func.count()).select_from(Payment).where(Payment.invoice_id == invoice_id))
                credits = await session.scalar(select(func.count()).select_from(LedgerEntry).where(
                    LedgerEntry.invoice_id == invoice_id, LedgerEntry.entry_type == "payment_received"))
                return doc.status, doc.total, doc.amount_paid, doc.balance, payments, credits
        return Operation(family, "POST", f"/api/v1/invoices/{invoice_id}/payments",
                         {**admin, "Idempotency-Key": str(uuid.uuid4())}, {"amount": 25, "method": "cash"}, read)

    if family == "conversation":
        case = await client.post("/api/v1/cases", headers=admin, json={
            "customer_id": str(customer), "title": marker,
        })
        assert case.status_code == 201
        case_id = uuid.UUID(case.json()["id"])
        async def read():
            async with async_session_factory() as session:
                ids = tuple(await session.scalars(select(Conversation.id).where(Conversation.case_id == case_id)))
                messages = await session.scalar(select(func.count()).select_from(Message).where(Message.conversation_id.in_(ids)))
                participants = await session.scalar(select(func.count()).select_from(Participant).where(Participant.conversation_id.in_(ids)))
                return ids, messages, participants
        return Operation(family, "GET", f"/api/v1/cases/{case_id}/conversation", admin, None, read, 200)

    assert family == "customer"
    headers = {"Authorization": "Bearer " + await persisted_access({
        "sub": str(customer), "scid": str(center), "type": "customer_access",
    })}
    async def read():
        async with async_session_factory() as session:
            cases = tuple(await session.scalars(select(OperationalCase.id).where(
                OperationalCase.customer_id == customer, OperationalCase.description == marker)))
            conversations = tuple(await session.scalars(select(Conversation.id).where(Conversation.case_id.in_(cases))))
            messages = await session.scalar(select(func.count()).select_from(Message).where(Message.conversation_id.in_(conversations)))
            return cases, conversations, messages
    return Operation(family, "POST", "/api/v1/customer/roadside", headers,
                     {"description": marker, "vehicle_id": detail["vehicle_id"]}, read, 200)


FAMILIES = ["tenant", "owner", "mechanic", "customer", "conversation", "payment"]


@pytest.mark.parametrize("family", FAMILIES)
async def test_transaction_is_durable_at_first_success_send(family, client, workshop, identity, monkeypatch):
    operation = await prepare_operation(family, client, workshop, identity)
    before = await operation.read()
    observations, statuses, events = [], [], []
    with monkeypatch.context() as patch:
        patch.setattr(event_bus, "dispatch", events.append)
        response = await send_observed(operation, observations, statuses)
    after = await operation.read()
    assert response.status_code == operation.success and statuses == [operation.success]
    assert after != before, "The exercised request must actually mutate PostgreSQL"
    assert observations == [after], "An independent session must see the committed aggregate at FIRST success send"
    if family == "owner":
        assert len(after[0]) == 1 and after[1] == 1  # account and audit in one transaction
    if family == "payment":
        assert after == ("partial", 100, 25, 75, 1, 1)
        replay = await client.post(operation.path, headers=operation.headers, json=operation.body)
        assert replay.status_code == 201 and await operation.read() == after
    if family == "conversation":
        assert len(after[0]) == 1 and after[1:] == (1, 1)


@pytest.mark.parametrize("family", FAMILIES)
async def test_failed_transaction_cannot_send_success_or_leave_partial_state(family, client, workshop, identity, monkeypatch):
    operation = await prepare_operation(family, client, workshop, identity)
    before = await operation.read()
    observations, statuses, events = [], [], []

    async def failed_commit(uow):
        raise RuntimeError("Controlled precommit failure")

    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", failed_commit)
        patch.setattr(event_bus, "dispatch", events.append)
        response = await send_observed(operation, observations, statuses)
    assert response.status_code == 500 and statuses == [500]
    assert observations == [] and events == []
    assert await operation.read() == before
    # The same real financial idempotency key recovers after rollback and replays once.
    if family == "payment":
        recovered = await client.post(operation.path, headers=operation.headers, json=operation.body)
        assert recovered.status_code == 201
        assert await operation.read() == ("partial", 100, 25, 75, 1, 1)
        replay = await client.post(operation.path, headers=operation.headers, json=operation.body)
        assert replay.status_code == 201 and await operation.read() == ("partial", 100, 25, 75, 1, 1)


@pytest.mark.parametrize("fail", [False, True], ids=["success", "failed-commit"])
async def test_customer_session_finishes_before_token_success(fail, client, workshop, identity, monkeypatch):
    from sqlalchemy import func, select
    from app.core.security import hash_password
    from app.models import AuthSession
    from app.models.customer_account import CustomerAccount
    email = f"txn-{uuid.uuid4().hex}@example.com"
    async with async_session_factory() as session:
        customer = Customer(service_center_id=identity["center"], full_name="Transaction customer",
                            phone="998" + str(uuid.uuid4().int)[:9])
        session.add(customer)
        await session.flush()
        session.add(CustomerAccount(customer_id=customer.id, service_center_id=identity["center"],
                                    email=email, password_hash=hash_password(PASSWORD)))
        await session.commit()
        customer_id = customer.id
    async def read():
        async with async_session_factory() as session:
            return await session.scalar(select(func.count()).select_from(AuthSession)
                                        .where(AuthSession.customer_id == customer_id))
    body = {"email": email, "password": PASSWORD}
    operation = Operation("customer-auth", "POST", "/api/v1/customer/auth/login", {}, body, read, 200)
    before = await read()
    observations, statuses = [], []
    async def failed_commit(session):
        raise RuntimeError("Controlled customer-auth precommit failure")
    with monkeypatch.context() as patch:
        if fail:
            patch.setattr(AsyncSession, "commit", failed_commit)
        response = await send_observed(operation, observations, statuses)
    if fail:
        assert response.status_code == 500 and statuses == [500] and observations == []
        assert await read() == before
    else:
        assert response.status_code == 200 and statuses == [200]
        assert observations == [before + 1] and await read() == before + 1


async def slot_booking(client, workshop, identity):
    job = await create_job(client, workshop)
    existing = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    async with async_session_factory() as session:
        slot = AppointmentSlot(service_center_id=identity["center"],
                               slot_date=datetime(2038, 4, 10, tzinfo=timezone.utc),
                               start_time="09:00", end_time="10:00", duration_minutes=60)
        session.add(slot)
        await session.commit()
        slot_id = slot.id
    return {"customer_id": existing["customer_id"], "vehicle_id": existing["vehicle_id"], "slot_id": str(slot_id)}, slot_id


async def test_booking_persists_replay_response_with_the_business_transaction(client, workshop, identity, monkeypatch):
    body, slot_id = await slot_booking(client, workshop, identity)
    key = str(uuid.uuid4())
    events, commits = [], []
    original_commit = UnitOfWork.commit
    async def record_commit(uow):
        commits.append(uow)
        await original_commit(uow)
    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", record_commit)
        patch.setattr(event_bus, "dispatch", events.append)
        headers = {**workshop["admin"], "Idempotency-Key": key}
        first = await client.post("/api/v1/appointments", headers=headers, json=body)
        initial_commits = len(commits)
        initial_events = len(events)
        replay = await client.post("/api/v1/appointments", headers=headers, json=body)
    assert first.status_code == replay.status_code == 201
    assert first.json()["id"] == replay.json()["id"]
    assert initial_commits == 1 and initial_events == len(events) == 1
    async with async_session_factory() as session:
        slot = await session.get(AppointmentSlot, slot_id)
        assert slot.status == "booked" and str(slot.appointment_id) == first.json()["id"]
        record = await session.scalar(select(IdempotencyRecord).where(
            IdempotencyRecord.service_center_id == identity["center"],
            IdempotencyRecord.key == key,
        ))
        assert record is not None and record.response_payload["id"] == first.json()["id"]


async def test_booking_failed_commit_rolls_back_key_and_same_key_retry_recovers(client, workshop, identity, monkeypatch):
    body, slot_id = await slot_booking(client, workshop, identity)
    key = str(uuid.uuid4())
    events, should_fail = [], True
    original_commit = UnitOfWork.commit
    async def sometimes_fail(uow):
        nonlocal should_fail
        if should_fail:
            should_fail = False
            raise RuntimeError("Controlled booking precommit failure")
        await original_commit(uow)
    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", sometimes_fail)
        patch.setattr(event_bus, "dispatch", events.append)
        headers = {**workshop["admin"], "Idempotency-Key": key}
        failed = await client.post("/api/v1/appointments", headers=headers, json=body)
        failed_events = len(events)
        async with async_session_factory() as session:
            slot = await session.get(AppointmentSlot, slot_id)
            rollback_state = slot.status, slot.appointment_id, slot.reserved_until
            record = await session.scalar(select(IdempotencyRecord).where(
                IdempotencyRecord.service_center_id == identity["center"],
                IdempotencyRecord.key == key,
            ))
        recovered = await client.post("/api/v1/appointments", headers=headers, json=body)
        replay = await client.post("/api/v1/appointments", headers=headers, json=body)
    assert (failed.status_code, record, failed_events, rollback_state,
            recovered.status_code, replay.status_code) == (500, None, 0, ("available", None, None), 201, 201)
    assert recovered.json()["id"] == replay.json()["id"]


async def test_direct_booking_replays_same_key_but_rejects_changed_payload(client, workshop, identity):
    body, _ = await slot_booking(client, workshop, identity)
    direct = {
        "customer_id": body["customer_id"],
        "vehicle_id": body["vehicle_id"],
        "appointment_date": "2038-04-10",
        "appointment_time": "09:00",
        "estimated_duration_minutes": 60,
        "customer_notes": "Oil change",
    }
    headers = {**workshop["admin"], "Idempotency-Key": str(uuid.uuid4())}
    first = await client.post("/api/v1/appointments/direct", headers=headers, json=direct)
    replay = await client.post("/api/v1/appointments/direct", headers=headers, json=direct)
    conflict = await client.post("/api/v1/appointments/direct", headers=headers, json={
        **direct, "customer_notes": "Different work",
    })
    assert first.status_code == replay.status_code == 201
    assert first.json()["id"] == replay.json()["id"]
    assert conflict.status_code == 409


async def test_same_booking_key_is_independent_between_real_tenants(client, workshop, identity):
    async with async_session_factory() as session:
        owner = await session.get(User, identity["user"])
        foreign = await session.get(User, uuid.UUID(workshop["ids"][2]))
        foreign_center = foreign.service_center_id
        # Grant only this owned foreign fixture account its existing admin role.
        # Its existing token must resolve the stored permission at request time.
        await session.execute(update(User).where(User.id == foreign.id).values(role_id=owner.role_id))
        await session.commit()
    foreign_workshop = {**workshop, "admin": workshop["mechanics"][2]}
    own_body, _ = await slot_booking(client, workshop, identity)
    foreign_body, _ = await slot_booking(client, foreign_workshop, {"center": foreign_center})
    key = str(uuid.uuid4())
    own = await client.post("/api/v1/appointments", headers={
        **workshop["admin"], "Idempotency-Key": key,
    }, json=own_body)
    other = await client.post("/api/v1/appointments", headers={
        **foreign_workshop["admin"], "Idempotency-Key": key,
    }, json=foreign_body)
    assert own.status_code == other.status_code == 201
    assert own.json()["id"] != other.json()["id"]
    assert (await client.get(f"/api/v1/appointments/{other.json()['id']}", headers=workshop["admin"])).status_code == 404


@pytest.mark.parametrize("second", ["none", "commit", "rollback"])
async def test_explicit_commit_does_not_skip_a_later_transaction(second, identity, monkeypatch):
    marker = uuid.uuid4().hex
    commits = []
    original_commit = UnitOfWork.commit
    async def record_commit(uow):
        commits.append(uow)
        await original_commit(uow)
    async def execute():
        async with UnitOfWork(service_center_id=identity["center"]) as uow:
            customer = Customer(service_center_id=identity["center"], full_name=marker)
            uow.session.add(customer)
            await uow.flush()
            await uow.commit()
            if second != "none":
                # Exercise a genuinely new transaction on the same session.
                await uow.session.execute(select(Customer.id).where(Customer.id == customer.id))
                customer.full_name = marker + " changed"
                await uow.flush()
                if second == "rollback":
                    raise RuntimeError("Controlled second-transaction failure")
    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", record_commit)
        if second == "rollback":
            with pytest.raises(RuntimeError, match="second-transaction"):
                await execute()
        else:
            await execute()
    async with async_session_factory() as session:
        names = list(await session.scalars(select(Customer.full_name).where(
            Customer.service_center_id == identity["center"])))
    assert names == [marker + " changed" if second == "commit" else marker]
    assert len(commits) == (2 if second == "commit" else 1)
