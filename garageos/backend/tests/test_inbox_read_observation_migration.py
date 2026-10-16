"""Actual populated migration and loss of authority through normal HTTP."""
import uuid

from sqlalchemy import text

from app.core.database import async_session_factory
from tests.test_identity_migration import migration_database  # noqa: F401
from tests.test_message_intent_migration import migrate, message_rows
from tests.test_message_intent_api import client, identity, owner, target  # noqa: F401
from tests.test_staff_management_api import login as staff_login


async def test_populated_legacy_counts_initialize_generations_without_guessing_history(migration_database):
    connection, upgrade = migration_database
    result = upgrade('upgrade', 'e6f7a8b9c0d1')
    assert result.returncode == 0, result.stderr
    center, conversation, message = (uuid.uuid4() for _ in range(3))
    await connection.execute("INSERT INTO service_centers (id, name, timezone, is_active) VALUES ($1, 'Observed migration garage', 'UTC', true)", center)
    await connection.execute("INSERT INTO conversations (id, service_center_id, subject, conv_type, status, priority, unread_messages, unread_activity, summary_version, is_active) VALUES ($1, $2, 'Preserved history', 'general', 'waiting_customer', 'high', 3, 2, 0, true)", conversation, center)
    # Recorded counters can exceed retained message rows; never invent a history
    # backfill or initialize them by recounting messages instead of recorded state.
    await connection.execute("INSERT INTO conversation_messages (id, service_center_id, conversation_id, kind, channel, is_internal, author_role, body, delivery_status, is_active) VALUES ($1, $2, $3, 'text', 'web', false, 'customer', 'Keep original history', 'sent', true)", message, center, conversation)
    history = await connection.fetchval('SELECT row_to_json(m)::text FROM conversation_messages m WHERE id=$1', message)
    for args in [('upgrade', 'head'), ('downgrade', 'e6f7a8b9c0d1'), ('upgrade', 'head')]:
        result = upgrade(*args)
        assert result.returncode == 0, result.stderr
        assert await connection.fetchval('SELECT row_to_json(m)::text FROM conversation_messages m WHERE id=$1', message) == history
        row = await connection.fetchrow('SELECT subject,status,priority,unread_messages,unread_activity FROM conversations WHERE id=$1', conversation)
        assert tuple(row) == ('Preserved history', 'waiting_customer', 'high', 3, 2)
        if args[0] == 'upgrade':
            generations = await connection.fetchrow('SELECT message_generation,activity_generation,acknowledged_message_generation,acknowledged_activity_generation FROM conversations WHERE id=$1', conversation)
            assert tuple(generations) == (3, 2, 0, 0)
            assert await connection.fetchval('SELECT count(*) FROM conversation_read_observations') == 0
        else:
            assert await connection.fetchval("SELECT to_regclass('public.conversation_read_observations')") is None
    result = upgrade('check')
    assert result.returncode == 0, result.stderr


async def test_reupgrade_discards_observations_and_old_uuid_cannot_clear_new_arrivals(client, target, identity):
    path = f"/api/v1/conversations/{target['id']}"
    response = await client.post(path + '/messages', headers=target['staff'],
                                json={'body': 'Before downgrade', 'author_role': 'customer'})
    assert response.status_code == 201
    observed = await client.get(path, headers=target['staff'])
    assert observed.status_code == 200
    old = observed.json()['read_observation']
    history = await message_rows(target['id'])
    try:
        await migrate('downgrade', 'e6f7a8b9c0d1')
        async with async_session_factory() as session:
            assert await session.scalar(text("SELECT to_regclass('public.conversation_read_observations')")) is None
            assert (await session.execute(text('SELECT unread_messages,unread_activity FROM conversations WHERE id=:id'), {'id': uuid.UUID(target['id'])})).one() == (1, 0)
        assert await message_rows(target['id']) == history
    finally:
        await migrate('upgrade', 'head')
    await migrate('check')
    assert await message_rows(target['id']) == history
    async with async_session_factory() as session:
        assert await session.scalar(text('SELECT count(*) FROM conversation_read_observations WHERE conversation_id=:id'), {'id': uuid.UUID(target['id'])}) == 0
    # This destructive downgrade also drops server session authority. Historical
    # business records survive, while both old bearer families require login.
    assert (await client.get('/api/v1/auth/me', headers=target['staff'])).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=target['customer'])).status_code == 401
    target['staff'] = await staff_login(client, identity['email'])
    fresh = await client.get('/api/v1/auth/me', headers=target['staff'])
    assert fresh.status_code == 200 and fresh.json()['id'] == str(identity['user'])
    response = await client.post(path + '/messages', headers=target['staff'],
                                json={'body': 'After reupgrade', 'author_role': 'customer'})
    assert response.status_code == 201
    denied = await client.patch(path, headers=target['staff'], json={'mark_read': True, 'read_observation': old})
    assert denied.status_code == 422
    assert denied.json()['error']['code'] == 'CONVERSATION_READ_OBSERVATION_INVALID'
    current = await client.get(path, headers=target['staff'])
    assert current.status_code == 200 and current.json()['unread_messages'] == 2
    accepted = await client.patch(path, headers=target['staff'], json={'mark_read': True, 'read_observation': current.json()['read_observation']})
    assert accepted.status_code == 200
    assert (await client.get(path, headers=target['staff'])).json()['unread_messages'] == 0
