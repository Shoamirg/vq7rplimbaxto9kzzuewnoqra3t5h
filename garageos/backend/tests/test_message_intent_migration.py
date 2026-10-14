"""Real migration receipt loss is explicit; historical messages stay intact.

Run serially against the isolated test database, just like the HTTP suite. This
test executes Alembic rather than rebuilding ORM metadata or inventing a backfill.
"""
import asyncio
import sys
import uuid
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import async_session_factory
from tests.test_message_intent_api import client, identity, owner, snapshot, target  # noqa: F401
from tests.test_staff_management_api import login as staff_login


async def migrate(*args):
    url = make_url(settings.DATABASE_URL)
    assert settings.ENVIRONMENT == "test" and url.database == "garage_test"
    assert url.host in {"localhost", "127.0.0.1"}
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "alembic", *args, cwd=Path(__file__).resolve().parents[1],
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout=120)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    assert process.returncode == 0, output.decode()


async def message_rows(conversation):
    async with async_session_factory() as session:
        rows = await session.execute(text("""
            SELECT row_to_json(m)::text FROM conversation_messages m
            WHERE conversation_id = :conversation ORDER BY id
        """), {"conversation": uuid.UUID(conversation)})
        attachments = await session.execute(text("""
            SELECT row_to_json(a)::text FROM conversation_attachments a
            WHERE conversation_id = :conversation ORDER BY id
        """), {"conversation": uuid.UUID(conversation)})
        return list(rows.scalars()), list(attachments.scalars())


async def test_downgrade_preserves_messages_but_reupgrade_cannot_restore_receipts(client, target, identity):
    path = f"/api/v1/conversations/{target['id']}/messages"
    legacy = await client.post(path, headers=target["staff"], json={"body": "Legacy unkeyed message"})
    assert legacy.status_code == 201
    key = str(uuid.uuid4())
    headers = {**target["staff"], "Idempotency-Key": key}
    payload = {"body": "Receipt-bearing message", "attachments": [{"kind": "document", "label": "Original document"}]}
    keyed = await client.post(path, headers=headers, json=payload)
    assert keyed.status_code == 201
    before = await message_rows(target["id"])
    assert len((await snapshot(target))["intents"]) == 1
    try:
        await migrate("downgrade", "d5e6f7a8b9c0")
        async with async_session_factory() as session:
            assert await session.scalar(text("SELECT to_regclass('public.message_intents')")) is None
        assert await message_rows(target["id"]) == before
    finally:
        # Never leave the next serial test with the previous schema, even if a
        # regression above fails. Re-upgrade is explicitly NOT receipt recovery.
        await migrate("upgrade", "head")
    await migrate("check")
    assert await message_rows(target["id"]) == before
    assert (await snapshot(target))["intents"] == []
    # Auth session rows are intentionally lost too. Re-authenticate the same
    # persisted staff identity; never restore the discarded session or receipt.
    assert (await client.get('/api/v1/auth/me', headers=target['staff'])).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=target['customer'])).status_code == 401
    target['staff'] = await staff_login(client, identity['email'])
    fresh = await client.get('/api/v1/auth/me', headers=target['staff'])
    assert fresh.status_code == 200 and fresh.json()['id'] == str(identity['user'])
    headers = {**target['staff'], 'Idempotency-Key': key}
    # Documented destructive downgrade consequence, rather than false safe
    # replay: the old key has been lost and would create a new durable message.
    replay = await client.post(path, headers=headers, json=payload)
    assert replay.status_code == 201 and replay.json()["id"] != keyed.json()["id"]
    assert len((await snapshot(target))["ids"]) == 3
