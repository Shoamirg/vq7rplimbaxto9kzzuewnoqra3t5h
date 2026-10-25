"""Durable message effects through real auth, PostgreSQL and the normal UoW.

The only observation seam records post-commit local events. Fixtures are private
tenant records; no dependency overrides, fake cache or disabled foreign keys.
"""
import asyncio
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.events import event_bus
from app.models import Customer, MessageIntent
from app.models.conversation import Attachment, Conversation, Message
from tests.support.auth_sessions import persisted_pair
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401
from tests.test_staff_management_api import owner  # noqa: F401


@pytest_asyncio.fixture
async def target(client, identity, owner, monkeypatch):
    customer = await client.post("/api/v1/customers", headers=owner, json={
        "full_name": "Private message-intent customer",
        "phone": "998" + str(uuid.uuid4().int)[:12],
    })
    assert customer.status_code == 201
    signed = await persisted_pair({"sub": customer.json()["id"], "scid": str(identity["center"]),
                                   "type": "customer_access"})
    thread = await client.post("/api/v1/conversations", headers=owner, json={
        "subject": "Private intent test", "customer_id": customer.json()["id"],
    })
    assert thread.status_code == 201
    return {
        "id": thread.json()["id"], "customer_id": customer.json()["id"],
        "center": identity["center"], "staff_id": identity["user"], "staff": owner,
        "customer": {"Authorization": "Bearer " + signed["access_token"]},
    }


async def snapshot(target):
    async with async_session_factory() as session:
        conv = await session.get(Conversation, uuid.UUID(target["id"]))
        messages = list((await session.scalars(select(Message).where(Message.conversation_id == conv.id))).all())
        attachments = list((await session.scalars(select(Attachment).where(Attachment.conversation_id == conv.id))).all())
        intents = list((await session.scalars(select(MessageIntent).where(MessageIntent.conversation_id == conv.id))).all())
        return {
            "ids": sorted(str(message.id) for message in messages),
            "attachments": sorted(str(attachment.id) for attachment in attachments),
            "unread": conv.unread_messages, "activity": conv.last_activity_at,
            "last_message": conv.last_message_at, "preview": conv.last_message_preview,
            "channel": conv.last_channel, "sender": conv.last_sender_role,
            "status": conv.status, "updated": conv.updated_at,
            "intents": [(str(intent.id), str(intent.message_id), intent.actor_kind, str(intent.actor_id),
                         str(intent.key), intent.fingerprint_version, intent.fingerprint, intent.response)
                        for intent in sorted(intents, key=lambda row: str(row.id))],
        }


def request_target(target, actor, key):
    path = (f"/api/v1/conversations/{target['id']}/messages" if actor == "staff"
            else f"/api/v1/customer/messages/{target['id']}")
    return path, {**target[actor], "Idempotency-Key": key}


async def wait_for_message_lock(blocker_pid):
    """Prove the competitor waits behind this exact aggregate transaction.

    PostgreSQL may truncate pg_stat_activity.query before a long statement's
    FOR UPDATE clause. Actual blocking PIDs and relation locks remain observable.
    """
    async with asyncio.timeout(10):
        while True:
            async with async_session_factory() as session:
                waiting = await session.scalar(text("""
                    WITH RECURSIVE owned_waiters(pid) AS (
                        SELECT pid FROM pg_stat_activity WHERE :blocker = ANY(pg_blocking_pids(pid))
                        UNION
                        SELECT activity.pid FROM pg_stat_activity activity
                        JOIN owned_waiters parent ON parent.pid = ANY(pg_blocking_pids(activity.pid))
                    )
                    SELECT 1 FROM pg_stat_activity activity
                    JOIN owned_waiters waiter ON waiter.pid = activity.pid
                    JOIN pg_locks lock ON lock.pid = activity.pid
                    WHERE activity.datname = current_database() AND activity.wait_event_type = 'Lock'
                        AND lock.relation = 'public.conversations'::regclass
                        AND lock.mode = 'RowShareLock' AND lock.granted
                    LIMIT 1
                """), {'blocker': blocker_pid})
            if waiting:
                return
            await asyncio.sleep(.02)


@pytest.mark.parametrize("actor", ["staff", "customer"])
@pytest.mark.parametrize("parallel", [0, 2, 8])
async def test_replay_returns_one_committed_message_and_one_event(client, target, monkeypatch, actor, parallel):
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    path, headers = request_target(target, actor, str(uuid.uuid4()))
    payload = {"body": "  Exact text\nwith spaces  "}
    if actor == "staff":
        payload["attachments"] = [{"kind": "document", "label": "Receipt", "meta": {"a": 1, "b": [1, 2]}}]
    if parallel:
        responses = await asyncio.gather(*[client.post(path, headers=headers, json=payload) for _ in range(parallel)])
    else:
        first = await client.post(path, headers=headers, json=payload)
        before_replay = await snapshot(target)
        # A current profile display name is not new request content.
        async with async_session_factory() as session:
            from app.models import User
            row = await session.get(User if actor == "staff" else Customer,
                                    target["staff_id"] if actor == "staff" else uuid.UUID(target["customer_id"]))
            row.full_name = "Changed current display name"
            await session.commit()
        responses = [first, await client.post(path, headers=headers, json=payload)]
    assert [response.status_code for response in responses] == [201 if actor == "staff" else 200] * len(responses)
    assert all(response.json() == responses[0].json() for response in responses)
    saved = await snapshot(target)
    assert saved["ids"] == [responses[0].json()["id"]]
    assert len(saved["attachments"]) == (1 if actor == "staff" else 0)
    assert saved["unread"] == (1 if actor == "customer" else 0)
    assert len(saved["intents"]) == 1
    assert saved["intents"][0][1:3] == (responses[0].json()["id"], actor)
    if actor == "staff":
        assert saved["intents"][0][7] == responses[0].json()
    else:
        assert saved["intents"][0][7]["id"] == responses[0].json()["id"]
    if not parallel:
        assert saved == before_replay
    assert len(events) == 1 and type(events[0]).__name__ == "MessagePosted"


@pytest.mark.parametrize("actor", ["staff", "customer"])
@pytest.mark.parametrize("key", ["", "not-a-uuid", "x" * 1024])
async def test_invalid_key_never_changes_state(client, target, monkeypatch, actor, key):
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    before = await snapshot(target)
    path, headers = request_target(target, actor, key)
    response = await client.post(path, headers=headers, json={"body": "Must not be stored"})
    assert response.status_code == 422
    assert await snapshot(target) == before and events == []


@pytest.mark.parametrize("change", [
    {"body": "Different"}, {"body": " Original "}, {"kind": "note"},
    {"kind": "announcement"}, {"is_internal": True}, {"channel": "telegram"},
    {"author_role": "manager"}, {"author_name": "Explicit name"},
    {"mentions": ["@Second", "@First"]},
    {"attachments": [{"kind": "photo", "label": "Changed", "url": "https://example.com/photo", "meta": {"a": 1}}]},
])
async def test_material_change_conflicts_without_effect_or_cached_content(client, target, monkeypatch, change):
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    payload = {"body": "Original", "mentions": ["@First", "@Second"],
               "attachments": [{"kind": "document", "label": "Receipt", "url": None, "meta": {"a": 1}}]}
    assert (await client.post(path, headers=headers, json=payload)).status_code == 201
    before = await snapshot(target)
    response = await client.post(path, headers=headers, json={**payload, **change})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MESSAGE_INTENT_CONFLICT"
    assert "Original" not in response.text and "Receipt" not in response.text
    assert await snapshot(target) == before and len(events) == 1


async def test_object_key_order_and_effective_defaults_replay(client, target):
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    first = await client.post(path, headers=headers, json={"body": None, "mentions": [], "attachments": [
        {"label": "Receipt", "meta": {"a": 1, "b": 2}},
    ]})
    replay = await client.post(path, headers=headers, json={"attachments": [
        {"meta": {"b": 2, "a": 1}, "url": None, "kind": "photo", "label": "Receipt"},
    ], "mentions": None, "channel": "web", "kind": "text", "is_internal": False, "body": None})
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()


async def test_missing_key_retains_explicit_legacy_behavior(client, target):
    path, _ = request_target(target, "staff", str(uuid.uuid4()))
    first = await client.post(path, headers=target["staff"], json={"body": "Legacy"})
    second = await client.post(path, headers=target["staff"], json={"body": "Legacy"})
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert (await snapshot(target))["intents"] == []


@pytest.mark.parametrize("phase", ["message_flush", "receipt_flush", "commit"])
async def test_failed_transaction_persists_nothing_then_same_key_commits_once(client, target, monkeypatch, phase):
    from sqlalchemy.ext.asyncio import AsyncSession

    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    before = await snapshot(target)
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    original_flush, original_commit = AsyncSession.flush, AsyncSession.commit
    injected = False

    async def failing_flush(session, *args, **kwargs):
        nonlocal injected
        model = Message if phase == "message_flush" else MessageIntent
        if phase != "commit" and not injected and any(isinstance(row, model) for row in session.new):
            injected = True
            raise RuntimeError("Private QA forced message transaction flush failure")
        return await original_flush(session, *args, **kwargs)

    async def failing_commit(session):
        nonlocal injected
        if phase == "commit" and not injected:
            intent = await session.scalar(select(MessageIntent.id).where(MessageIntent.conversation_id == uuid.UUID(target["id"])))
            if intent is not None:
                injected = True
                raise RuntimeError("Private QA forced message transaction commit failure")
        return await original_commit(session)

    monkeypatch.setattr(AsyncSession, "flush", failing_flush)
    monkeypatch.setattr(AsyncSession, "commit", failing_commit)
    payload = {"body": "Rolled back", "attachments": [{"kind": "document", "label": "No orphan"}]}
    failed = await client.post(path, headers=headers, json=payload)
    assert injected and failed.status_code == 500
    assert await snapshot(target) == before and events == []
    monkeypatch.setattr(AsyncSession, "flush", original_flush)
    monkeypatch.setattr(AsyncSession, "commit", original_commit)
    retry = await client.post(path, headers=headers, json=payload)
    replay = await client.post(path, headers=headers, json=payload)
    assert retry.status_code == replay.status_code == 201 and retry.json() == replay.json()
    saved = await snapshot(target)
    assert len(saved["ids"]) == len(saved["attachments"]) == len(saved["intents"]) == len(events) == 1


@pytest.mark.parametrize("rollback", [False, True])
async def test_duplicate_waits_for_first_commit_or_rollback(client, target, monkeypatch, rollback):
    from app.repositories.unit_of_work import UnitOfWork
    original = UnitOfWork.commit
    committing, release = asyncio.Event(), asyncio.Event()
    observed_events = []
    first = True
    blocker_pid = None
    monkeypatch.setattr(event_bus, "dispatch", observed_events.append)

    async def paused_commit(uow):
        nonlocal first, blocker_pid
        intent = await uow.session.scalar(select(MessageIntent.id).where(MessageIntent.conversation_id == uuid.UUID(target["id"])))
        if intent is not None and first:
            first = False
            blocker_pid = await uow.session.scalar(text('SELECT pg_backend_pid()'))
            committing.set()
            await release.wait()
            if rollback:
                raise RuntimeError("Private QA forced rollback after duplicate waiter arrived")
        return await original(uow)

    monkeypatch.setattr(UnitOfWork, "commit", paused_commit)
    path, headers = request_target(target, "customer", str(uuid.uuid4()))
    first_call = asyncio.create_task(client.post(path, headers=headers, json={"body": "Wait for transaction"}))
    second_call = None
    try:
        await asyncio.wait_for(committing.wait(), timeout=10)
        second_call = asyncio.create_task(client.post(path, headers=headers, json={"body": "Wait for transaction"}))
        # Independent connections see no durable effect while the first commit
        # is paused; the duplicate has neither returned nor dispatched an event.
        assert blocker_pid is not None
        await wait_for_message_lock(blocker_pid)
        assert not second_call.done()
        assert (await snapshot(target))["ids"] == [] and observed_events == []
        release.set()
        replies = await asyncio.wait_for(asyncio.gather(first_call, second_call), timeout=10)
        assert [reply.status_code for reply in replies] == ([500, 200] if rollback else [200, 200])
        if not rollback:
            assert replies[0].json() == replies[1].json()
        saved = await snapshot(target)
        assert len(saved["ids"]) == len(saved["intents"]) == len(observed_events) == saved["unread"] == 1
    finally:
        release.set()
        tasks = [task for task in [first_call, second_call] if task is not None]
        try:
            await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=20)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


async def test_parallel_distinct_customer_intents_increment_fresh_unread(client, target):
    requests = []
    for i in range(8):
        path, headers = request_target(target, "customer", str(uuid.uuid4()))
        requests.append(client.post(path, headers=headers, json={"body": f"Distinct {i}"}))
    replies = await asyncio.gather(*requests)
    assert [reply.status_code for reply in replies] == [200] * 8
    saved = await snapshot(target)
    assert len(saved["ids"]) == len(saved["intents"]) == saved["unread"] == 8


async def test_same_key_isolated_by_actor_namespace_actor_uuid_and_conversation(client, target, identity):
    from tests.test_staff_access_lifecycle import PASSWORD
    from tests.test_staff_management_api import login

    key = str(uuid.uuid4())
    staff_path, staff_headers = request_target(target, "staff", key)
    original = await client.post(staff_path, headers=staff_headers, json={"body": "Same text"})
    customer_path, customer_headers = request_target(target, "customer", key)
    customer = await client.post(customer_path, headers=customer_headers, json={"body": "Same text"})
    staff = await client.post("/api/v1/staff", headers=target["staff"], json={
        "email": f"intent-{uuid.uuid4().hex}@example.com", "full_name": "Second actor", "role": "manager", "password": PASSWORD,
    })
    assert staff.status_code == 201
    other = await login(client, staff.json()["email"])
    other_response = await client.post(staff_path, headers={**other, "Idempotency-Key": key}, json={"body": "Same text"})
    assert original.status_code == other_response.status_code == 201 and customer.status_code == 200
    assert len({original.json()["id"], customer.json()["id"], other_response.json()["id"]}) == 3
    assert len((await snapshot(target))["intents"]) == 3

    # Equal UUIDs in staff/customer tables still identify different actors.
    async with async_session_factory() as session:
        same_uuid = Customer(id=identity["user"], service_center_id=identity["center"],
                             full_name="Equal UUID customer")
        session.add(same_uuid)
        await session.commit()
    signed = await persisted_pair({"sub": str(identity["user"]), "scid": str(identity["center"]),
                                   "type": "customer_access"})
    thread = await client.post("/api/v1/conversations", headers=target["staff"], json={"customer_id": str(identity["user"])})
    assert thread.status_code == 201
    next_id = thread.json()["id"]
    one = await client.post(f"/api/v1/conversations/{next_id}/messages", headers=staff_headers, json={"body": "Same text"})
    two = await client.post(f"/api/v1/customer/messages/{next_id}", headers={
        "Authorization": "Bearer " + signed["access_token"], "Idempotency-Key": key,
    }, json={"body": "Same text"})
    assert one.status_code == 201 and two.status_code == 200
    assert len({original.json()["id"], one.json()["id"], two.json()["id"]}) == 3


@pytest.mark.parametrize("suspension", ["staff", "customer", "center", "role", "staff_permission", "demo"])
async def test_current_policy_denies_cached_receipt(client, target, identity, monkeypatch, suspension):
    from app.models import Role, ServiceCenter, User
    from tests.test_staff_access_lifecycle import PASSWORD, _as_role
    actor = "customer" if suspension == "customer" else "staff"
    path, headers = request_target(target, actor, str(uuid.uuid4()))
    assert (await client.post(path, headers=headers, json={"body": "Protected receipt"})).status_code == (200 if actor == "customer" else 201)
    before = await snapshot(target)
    if suspension == "staff_permission":
        await _as_role(identity, "mechanic")
    elif suspension == "demo":
        monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
        monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
        signed = await client.post("/api/v1/auth/demo")
        assert signed.status_code == 200
        headers = {**headers, "Authorization": "Bearer " + signed.json()["access_token"]}
    else:
        async with async_session_factory() as session:
            model, row_id = {"staff": (User, identity["user"]), "customer": (Customer, uuid.UUID(target["customer_id"])),
                             "center": (ServiceCenter, identity["center"]), "role": (Role, None)}[suspension]
            if suspension == "role":
                row_id = (await session.get(User, identity["user"])).role_id
            row = await session.get(model, row_id)
            row.is_active = False
            await session.commit()
        # The shared seeded role is restored below for other real tenants/tests.
    try:
        denied = await client.post(path, headers=headers, json={"body": "Protected receipt"})
        assert denied.status_code == (403 if suspension in {"staff_permission", "demo"} else 401)
        assert "Protected receipt" not in denied.text
        assert await snapshot(target) == before
    finally:
        if suspension == "role":
            async with async_session_factory() as session:
                row = await session.get(Role, row_id)
                row.is_active = True
                await session.commit()


@pytest_asyncio.fixture
async def foreign(client, target, identity):
    from datetime import datetime, timezone
    from sqlalchemy import delete
    from app.core.security import hash_password
    from app.models import Appointment, Brand, Invoice, OperationalCase, ServiceCenter, User, Vehicle, VehicleModel
    from tests.test_staff_access_lifecycle import PASSWORD
    from tests.test_staff_management_api import login

    async with async_session_factory() as session:
        center = ServiceCenter(name="Private foreign intent garage")
        brand = Brand(name="Intent QA " + uuid.uuid4().hex)
        session.add_all([center, brand])
        await session.flush()
        role_id = (await session.get(User, identity["user"])).role_id
        user = User(service_center_id=center.id, role_id=role_id, email=f"intent-foreign-{uuid.uuid4().hex}@example.com",
                    password_hash=hash_password(PASSWORD), full_name="Foreign intent staff")
        customer = Customer(service_center_id=center.id, full_name="Foreign intent customer", telegram_id=uuid.uuid4().int % 10**12)
        model = VehicleModel(brand_id=brand.id, name="Intent QA", year_start=2020)
        session.add_all([user, customer, model])
        await session.flush()
        vehicle = Vehicle(service_center_id=center.id, customer_id=customer.id, vehicle_model_id=model.id, year=2020)
        session.add(vehicle)
        await session.flush()
        case = OperationalCase(service_center_id=center.id, customer_id=customer.id, vehicle_id=vehicle.id,
                               code="QA38-FOREIGN", title="Foreign case")
        appointment = Appointment(service_center_id=center.id, customer_id=customer.id, vehicle_id=vehicle.id,
                                  appointment_date=datetime.now(timezone.utc), appointment_time="10:00")
        invoice = Invoice(service_center_id=center.id, customer_id=customer.id, vehicle_id=vehicle.id, code="QA38-FOREIGN")
        conv = Conversation(service_center_id=center.id, customer_id=customer.id)
        session.add_all([case, appointment, invoice, conv])
        await session.flush()
        message = Message(service_center_id=center.id, conversation_id=conv.id, body="Foreign private message")
        session.add(message)
        await session.commit()
        records = {"center": center.id, "brand": brand.id, "model": model.id,
                   "user": user.id, "customer": customer.id, "vehicle": vehicle.id,
                   "case": case.id, "appointment": appointment.id, "invoice": invoice.id,
                   "conversation": conv.id, "message": message.id, "telegram": customer.telegram_id}
        email = user.email
    try:
        records["staff_headers"] = await login(client, email)
        signed = await persisted_pair({"sub": str(records["customer"]), "scid": str(records["center"]),
                                       "type": "customer_access"})
        records["customer_headers"] = {"Authorization": "Bearer " + signed["access_token"]}
        yield records
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(User).where(User.id == records["user"]))
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == records["center"]))
            await session.execute(delete(VehicleModel).where(VehicleModel.id == records["model"]))
            await session.execute(delete(Brand).where(Brand.id == records["brand"]))
            await session.commit()


@pytest.mark.parametrize("edge", [
    "customer", "vehicle", "case", "appointment", "invoice", "assigned_user", "missing_invoice",
    "participant_center", "participant_customer", "participant_user", "message_center", "message_author",
    "attachment_center", "attachment_outgoing", "attachment_incoming", "receipt_message", "inactive_conversation",
])
async def test_invalid_target_or_legacy_edge_is_denied_before_replay(client, target, foreign, monkeypatch, edge):
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    payload = {"body": "Protected original", "attachments": [{"label": "Protected attachment"}]}
    first = await client.post(path, headers=headers, json=payload)
    assert first.status_code == 201
    async with async_session_factory() as session:
        conv = await session.get(Conversation, uuid.UUID(target["id"]))
        if edge in {"customer", "vehicle", "case", "appointment", "invoice", "assigned_user"}:
            setattr(conv, edge + "_id", foreign["user" if edge == "assigned_user" else edge])
        elif edge == "missing_invoice":
            conv.invoice_id = uuid.uuid4()  # legacy plain-UUID column; FK remains enabled
        elif edge == "inactive_conversation":
            conv.is_active = False
        elif edge.startswith("participant_"):
            from app.models.conversation import Participant
            session.add(Participant(
                service_center_id=foreign["center"] if edge == "participant_center" else target["center"],
                conversation_id=conv.id, display_name="Private legacy participant",
                customer_id=foreign["customer"] if edge == "participant_customer" else None,
                user_id=foreign["user"] if edge == "participant_user" else None,
            ))
        elif edge.startswith("message_"):
            message = await session.get(Message, uuid.UUID(first.json()["id"]))
            if edge == "message_center":
                message.service_center_id = foreign["center"]
            else:
                message.author_user_id = foreign["user"]
        elif edge == "receipt_message":
            receipt = await session.scalar(select(MessageIntent).where(MessageIntent.conversation_id == conv.id))
            receipt.message_id = foreign["message"]
        else:
            attachment = await session.get(Attachment, uuid.UUID(first.json()["attachments"][0]["id"]))
            if edge == "attachment_center":
                attachment.service_center_id = foreign["center"]
            elif edge == "attachment_outgoing":
                attachment.conversation_id = foreign["conversation"]
            else:
                attachment.message_id = foreign["message"]
        await session.commit()
    before = await snapshot(target)
    for attempt in [payload, {"body": "Changed protected content"}]:
        denied = await client.post(path, headers=headers, json=attempt)
        assert denied.status_code == 404
        assert "Protected original" not in denied.text and "Protected attachment" not in denied.text
    assert await snapshot(target) == before and len(events) == 1


async def test_foreign_and_wrong_principal_cannot_replay_but_other_tenant_key_is_independent(client, target, foreign):
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    original = await client.post(path, headers=headers, json={"body": "Protected"})
    assert original.status_code == 201
    before = await snapshot(target)
    for other in [foreign["staff_headers"], foreign["customer_headers"]]:
        denied = await client.post(path, headers={**other, "Idempotency-Key": headers["Idempotency-Key"]}, json={"body": "Protected"})
        assert denied.status_code == (404 if other is foreign["staff_headers"] else 401)
    customer_path, customer_headers = request_target(target, "customer", headers["Idempotency-Key"])
    assert (await client.post(customer_path, headers=headers, json={"body": "Protected"})).status_code == 401
    assert (await client.post(customer_path, headers={**foreign["customer_headers"], "Idempotency-Key": headers["Idempotency-Key"]}, json={"body": "Protected"})).status_code == 404
    own_other = await client.post(f"/api/v1/conversations/{foreign['conversation']}/messages", headers={
        **foreign["staff_headers"], "Idempotency-Key": headers["Idempotency-Key"],
    }, json={"body": "Protected"})
    assert own_other.status_code == 201 and own_other.json()["id"] != original.json()["id"]
    assert await snapshot(target) == before


@pytest.mark.parametrize("change", ["label", "url", "kind", "meta", "order"])
async def test_complete_ordered_attachment_payload_is_material(client, target, change):
    import copy
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    payload = {"body": "Attachments", "attachments": [
        {"label": "A", "kind": "photo", "url": "https://example.com/a", "meta": {"a": [1, 2]}},
        {"label": "B", "kind": "document", "url": None, "meta": {}},
    ]}
    assert (await client.post(path, headers=headers, json=payload)).status_code == 201
    before = await snapshot(target)
    altered = copy.deepcopy(payload)
    if change == "order":
        altered["attachments"].reverse()
    else:
        altered["attachments"][0][change] = {"label": "New", "url": None, "kind": "document", "meta": {"a": [2, 1]}}[change]
    denied = await client.post(path, headers=headers, json=altered)
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "MESSAGE_INTENT_CONFLICT"
    assert await snapshot(target) == before


async def test_current_delivery_status_does_not_change_acknowledged_response(client, target):
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    first = await client.post(path, headers=headers, json={"body": "Receipt"})
    assert first.status_code == 201
    async with async_session_factory() as session:
        message = await session.get(Message, uuid.UUID(first.json()["id"]))
        message.delivery_status = "read"
        await session.commit()
    before = await snapshot(target)
    replay = await client.post(path, headers=headers, json={"body": "Receipt"})
    assert replay.status_code == 201 and replay.json() == first.json()
    assert await snapshot(target) == before
    thread = await client.get(f"/api/v1/conversations/{target['id']}", headers=target["staff"])
    assert thread.status_code == 200
    assert "fingerprint" not in thread.text and "actor_kind" not in thread.text


@pytest.mark.parametrize("role", ["mechanic", "customer", "system"])
async def test_nondefaulted_author_null_and_empty_are_different_content(client, target, role):
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    first = await client.post(path, headers=headers, json={"body": "Snapshot", "author_role": role, "author_name": None})
    assert first.status_code == 201 and first.json()["author_name"] is None
    before = await snapshot(target)
    conflict = await client.post(path, headers=headers, json={"body": "Snapshot", "author_role": role, "author_name": ""})
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "MESSAGE_INTENT_CONFLICT"
    assert await snapshot(target) == before


@pytest.mark.parametrize("role", ["dispatcher", "manager"])
async def test_defaulted_staff_author_null_and_empty_replay_same_snapshot(client, target, role):
    path, headers = request_target(target, "staff", str(uuid.uuid4()))
    first = await client.post(path, headers=headers, json={"body": "Snapshot", "author_role": role, "author_name": None})
    assert first.status_code == 201 and first.json()["author_name"]
    replay = await client.post(path, headers=headers, json={"body": "Snapshot", "author_role": role, "author_name": ""})
    assert replay.status_code == 201 and replay.json() == first.json()


@pytest.mark.parametrize("keyed", [False, True])
async def test_customer_owner_is_checked_after_lock_for_keyed_and_unkeyed_writes(client, target, keyed):
    other = await client.post("/api/v1/customers", headers=target["staff"], json={
        "full_name": "New local conversation owner", "phone": "998" + str(uuid.uuid4().int)[:12],
    })
    assert other.status_code == 201
    path, headers = request_target(target, "customer", str(uuid.uuid4()))
    if not keyed:
        headers = target["customer"]
    pending = None
    try:
        async with async_session_factory() as locker:
            conv = await locker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target["id"])).with_for_update())
            conv.customer_id = uuid.UUID(other.json()["id"])
            await locker.flush()  # old owner remains visible to an unlocked MVCC read
            blocker_pid = await locker.scalar(text("SELECT pg_backend_pid()"))
            pending = asyncio.create_task(client.post(path, headers=headers, json={"body": "Old owner cannot send"}))
            await wait_for_message_lock(blocker_pid)
            assert not pending.done()
            await locker.commit()
        denied = await asyncio.wait_for(pending, timeout=10)
        assert denied.status_code == 404 and "Old owner cannot send" not in denied.text
        saved = await snapshot(target)
        assert saved["ids"] == saved["intents"] == [] and saved["unread"] == 0
    finally:
        # The locker context has released its owned transaction before this
        # bounded drain, including when an assertion or lock observation fails.
        if pending is not None:
            try:
                await asyncio.wait_for(asyncio.gather(pending, return_exceptions=True), timeout=20)
            finally:
                if not pending.done():
                    pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
