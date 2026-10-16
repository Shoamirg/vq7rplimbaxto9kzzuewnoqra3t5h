"""A caller waiting on the thread lock must retain current write authority."""
import asyncio
import uuid

import pytest
from sqlalchemy import select, text, update

from app.core.database import async_session_factory
from app.core.events import event_bus
from app.models import Customer, ServiceCenter, User
from app.models.conversation import Conversation, Participant
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, open_case, open_thread  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_inbox_mutations_api import create
from tests.test_inbox_read_observation_api import wait_for_owned_lock_waiters, drain_requests
from tests.test_staff_access_lifecycle import _as_role, client, identity  # noqa: F401


async def aggregate_snapshot(target):
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        participants = tuple((await session.execute(select(Participant.user_id, Participant.is_following).where(
            Participant.conversation_id == uuid.UUID(target)).order_by(Participant.id))).all())
        return (row.status, row.assigned_user_id, row.unread_messages, row.unread_activity,
                row.activity_generation, row.last_activity_at, participants)


@pytest.mark.parametrize("operation", ["status", "assignment", "follow", "unfollow", "message"])
@pytest.mark.parametrize("revoked", ["role", "garage", "session"])
async def test_pending_inbox_write_rolls_back_after_current_authority_revoked(
        client, references, identity, operation, revoked, monkeypatch):
    refs = references
    target = await create(client, refs)
    path = f"/api/v1/conversations/{target}"
    if operation == "unfollow":
        assert (await client.post(path + "/follow", headers=refs["admin"])).status_code == 200
    before = await aggregate_snapshot(target)
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    if operation == "status":
        request = client.patch(path, headers=refs["admin"], json={"status": "resolved"})
    elif operation == "assignment":
        request = client.patch(path, headers=refs["admin"], json={"assigned_user_id": refs["ids"][0]})
    elif operation == "message":
        request = client.post(path + "/messages", headers=refs["admin"], json={"body": "Must roll back"})
    else:
        request = client.request("DELETE" if operation == "unfollow" else "POST", path + "/follow", headers=refs["admin"])
    async with async_session_factory() as blocker:
        await blocker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target)).with_for_update())
        blocker_pid = await blocker.scalar(text("SELECT pg_backend_pid()"))
        pending = asyncio.create_task(request)
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 1)
            if revoked == "role":
                await _as_role(identity, "mechanic")
            elif revoked == "garage":
                async with async_session_factory() as writer:
                    await writer.execute(update(ServiceCenter).where(ServiceCenter.id == refs["center"]).values(is_active=False))
                    await writer.commit()
            else:
                assert (await client.post("/api/v1/auth/logout", headers=refs["admin"])).status_code == 200
        finally:
            await blocker.rollback()
            results = await drain_requests([pending])
    assert not isinstance(results[0], BaseException)
    assert results[0].status_code == (401 if revoked == "session" else 403), results[0].text
    assert await aggregate_snapshot(target) == before
    assert events == []


@pytest.mark.parametrize("kind", ["case", "customer"])
async def test_archived_owning_card_preserves_history_without_dead_link(client, references, kind):
    refs = references
    case_id = await open_case(client, refs)
    thread = await open_thread(client, refs, case_id)
    target = thread["id"]
    path = f"/api/v1/conversations/{target}"
    initial = await client.get(path, headers=refs["admin"])
    assert initial.status_code == 200
    old_card = next(card for card in initial.json()["linked"] if card["kind"] == kind)
    model = OperationalCase if kind == "case" else Customer
    owning_id = case_id if kind == "case" else refs["customer"]
    async with async_session_factory() as session:
        await session.execute(update(model).where(model.id == uuid.UUID(owning_id)).values(is_active=False))
        await session.commit()
    detail = await client.get(path, headers=refs["admin"])
    assert detail.status_code == 200, detail.text
    card = next(card for card in detail.json()["linked"] if card["kind"] == kind)
    assert card["title"] == old_card["title"] and card["subtitle"] == old_card["subtitle"]
    assert card["available"] is False and card["link"] is None
    assert detail.json()[kind + "_id"] == owning_id
    owning = "/api/v1/cases/" if kind == "case" else "/api/v1/customers/"
    assert (await client.get(owning + owning_id, headers=refs["admin"])).status_code == 404
