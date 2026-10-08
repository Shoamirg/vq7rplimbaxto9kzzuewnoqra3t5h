"""Concurrent case entry uses real password auth, PostgreSQL and normal UoW.

Only asynchronous event delivery is recorded. This proves case first-open
serialization, not global Inbox creation or durable message idempotency.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.config import settings
from app.core.events import event_bus
from app.models.conversation import Conversation, Message, Participant
from app.models import User
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, open_case  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


@pytest.mark.parametrize("requests", [2, 8])
async def test_concurrent_first_open_returns_one_durable_thread(client, references, monkeypatch, requests):
    case_id = await open_case(client, references)
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    replies = await asyncio.gather(*[
        client.get(f"/api/v1/cases/{case_id}/conversation", headers=references["admin"])
        for _ in range(requests)
    ])
    assert all(reply.status_code == 200 for reply in replies), [reply.status_code for reply in replies]
    ids = {reply.json()["id"] for reply in replies}
    assert len(ids) == 1
    async with async_session_factory() as session:
        threads = list((await session.scalars(select(Conversation).where(
            Conversation.case_id == uuid.UUID(case_id), Conversation.service_center_id == references["center"]))).all())
        assert len(threads) == 1 and str(threads[0].id) in ids
        participants = list((await session.scalars(select(Participant).where(Participant.conversation_id == threads[0].id))).all())
        messages = list((await session.scalars(select(Message).where(Message.conversation_id == threads[0].id))).all())
        assert len(participants) == 1
        assert len(messages) == 1 and messages[0].author_role == "system"
    assert sum(type(event).__name__ == "ConversationStarted" for event in events) == 1
    again = await client.get(f"/api/v1/cases/{case_id}/conversation", headers=references["admin"])
    assert again.status_code == 200 and again.json()["id"] in ids


async def test_concurrent_foreign_first_open_is_hidden_and_creates_no_thread(client, references, identity, monkeypatch):
    case_id = await open_case(client, references)
    events = []
    monkeypatch.setattr(event_bus, "dispatch", events.append)
    async with async_session_factory() as session:
        # A real password-authenticated foreign staff identity, given the same
        # persisted operator role as this workshop's admin (not a dependency override).
        foreign = await session.get(User, uuid.UUID(references["ids"][2]))
        owner = await session.get(User, identity["user"])
        foreign.role_id = owner.role_id
        await session.commit()
    replies = await asyncio.gather(*[
        client.get(f"/api/v1/cases/{case_id}/conversation", headers=references["mechanics"][2])
        for _ in range(4)
    ])
    assert [reply.status_code for reply in replies] == [404] * 4
    async with async_session_factory() as session:
        assert await session.scalar(select(Conversation.id).where(Conversation.case_id == uuid.UUID(case_id))) is None
    assert events == []


async def test_readonly_demo_can_read_case_without_creating_its_absent_thread(client, references, identity, monkeypatch):
    case_id = await open_case(client, references)
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
    login = await client.post("/api/v1/auth/demo")
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["permissions"] == ["staff.read"]
    case = await client.get(f"/api/v1/cases/{case_id}", headers=headers)
    assert case.status_code == 200 and case.json()["id"] == case_id
    missing_thread = await client.get(f"/api/v1/cases/{case_id}/conversation", headers=headers)
    assert missing_thread.status_code == 403
    assert missing_thread.json()["error"]["code"] == "CASE_CONVERSATION_UNAVAILABLE"
    denied = await client.patch(f"/api/v1/cases/{case_id}", headers=headers, json={"status": "resolved"})
    assert denied.status_code == 403
    async with async_session_factory() as session:
        assert await session.scalar(select(Conversation.id).where(Conversation.case_id == uuid.UUID(case_id))) is None
