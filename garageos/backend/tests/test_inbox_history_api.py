"""General thread read boundaries and complete recorded history, with real FK/UoW."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import event, select

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.models.conversation import Attachment, Conversation, Message, Participant
from app.models.notification import Notification
from tests.test_inbox_queue_api import (  # noqa: F401
    client, identity, inbox_rows, mechanic_workshop, references, workshop,
)


async def test_long_thread_history_is_complete_without_per_message_query_growth(client, inbox_rows):
    refs = inbox_rows
    recorded_at = datetime(2019, 1, 1, tzinfo=timezone.utc)
    async with async_session_factory() as session:
        short = Conversation(service_center_id=refs['center'], subject='Short query baseline')
        long = Conversation(service_center_id=refs['center'], subject='Long complete history')
        session.add_all([short, long])
        await session.flush()
        messages = [Message(service_center_id=refs['center'], conversation_id=long.id,
            body=f'Long history message {i}', author_role='customer', created_at=recorded_at)
            for i in range(512)]
        session.add_all(messages)
        await session.flush()
        attachments = [Attachment(service_center_id=refs['center'], conversation_id=long.id,
            message_id=messages[i].id, label=f'Recorded attachment {i}', kind='photo')
            for i in range(0, 512, 8)]
        notifications = [Notification(service_center_id=refs['center'], entity_type='conversation',
            entity_id=long.id, title=f'Long history event {i}', body=f'Event detail {i}',
            severity='info', category='system', created_at=recorded_at) for i in range(128)]
        session.add_all(attachments + notifications)
        await session.commit()
        message_ids = sorted(str(row.id) for row in messages)

    statements = []
    def record(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        short_response = await client.get(f'/api/v1/conversations/{short.id}', headers=refs['admin'])
        short_query_count = len(statements)
        statements.clear()
        long_response = await client.get(f'/api/v1/conversations/{long.id}', headers=refs['admin'])
        long_query_count = len(statements)
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)

    assert short_response.status_code == long_response.status_code == 200
    assert long_query_count == short_query_count
    thread = long_response.json()
    assert [message['id'] for message in thread['messages']] == message_ids
    assert sum(len(message['attachments']) for message in thread['messages']) == 64
    assert len([row for row in thread['activity'] if row['type'] == 'event']) == 128
    assert len([row for row in thread['activity'] if row['type'] == 'message']) == 512


async def test_readonly_demo_can_read_existing_thread_but_cannot_change_it(client, inbox_rows, identity, monkeypatch):
    refs = inbox_rows
    target = uuid.UUID(refs['oldest'])
    before = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
    assert before.status_code == 200
    monkeypatch.setattr(settings, 'DEMO_MODE_ENABLED', True)
    monkeypatch.setattr(settings, 'DEMO_EMAIL', identity['email'])
    login = await client.post('/api/v1/auth/demo')
    assert login.status_code == 200
    headers = {'Authorization': f"Bearer {login.json()['access_token']}"}
    profile = await client.get('/api/v1/auth/me', headers=headers)
    assert profile.status_code == 200 and profile.json()['permissions'] == ['staff.read']

    read = await client.get(f'/api/v1/conversations/{target}', headers=headers)
    assert read.status_code == 200 and read.json()['id'] == str(target)
    denied = await client.patch(f'/api/v1/conversations/{target}', headers=headers,
        json={'status': 'resolved'})
    assert denied.status_code == 403
    unchanged = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
    assert unchanged.status_code == 200 and unchanged.json()['status'] == before.json()['status']


async def test_all_old_events_and_tied_messages_remain_accessible(client, inbox_rows):
    refs = inbox_rows
    target = uuid.UUID(refs['oldest'])
    recorded_at = datetime(2019, 1, 1, tzinfo=timezone.utc)
    async with async_session_factory() as session:
        notifications = [Notification(service_center_id=refs['center'], entity_type='conversation',
            entity_id=target, title=f'Recorded event {i}', body=f'History {i}', severity='info',
            category='system', created_at=recorded_at) for i in range(55)]
        messages = [Message(service_center_id=refs['center'], conversation_id=target,
            body=f'Historical message {i}', author_role='customer', created_at=recorded_at)
            for i in range(95)]
        session.add_all(notifications + messages)
        await session.commit()
        notification_ids = sorted(str(row.id) for row in notifications)
        message_ids = sorted(str(row.id) for row in messages)
    response = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
    assert response.status_code == 200
    thread = response.json()
    events = [row for row in thread['activity'] if row['type'] == 'event']
    assert len(events) == 55
    assert [row['id'] for row in events] == notification_ids
    assert [row['id'] for row in thread['messages'][:95]] == message_ids
    assert len(thread['messages']) == 96
    repeated = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
    assert repeated.json()['messages'] == thread['messages']
    assert repeated.json()['activity'] == thread['activity']


async def test_vehicle_context_links_do_not_claim_a_health_score(client, inbox_rows):
    target = inbox_rows['vehicle_thread']
    response = await client.get(f'/api/v1/conversations/{target}', headers=inbox_rows['admin'])
    assert response.status_code == 200
    cards = response.json()['linked']
    vehicle = next(card for card in cards if card['kind'] == 'vehicle')
    assert vehicle['link'] == f"/vehicles/{inbox_rows['vehicle']}"
    assert vehicle['subtitle'] is None
    assert 'score' not in vehicle and 'band' not in vehicle


@pytest.mark.parametrize('edge', ['participant', 'message', 'attachment'])
async def test_compromised_children_deny_detail_read_and_mutations(client, inbox_rows, edge):
    refs = inbox_rows
    target = uuid.UUID(refs['oldest'])
    async with async_session_factory() as session:
        if edge == 'participant':
            session.add(Participant(service_center_id=refs['foreign_center'], conversation_id=target,
                display_name='FOREIGN-PRIVATE', role='watcher'))
        elif edge == 'message':
            session.add(Message(service_center_id=refs['foreign_center'], conversation_id=target,
                body='FOREIGN-PRIVATE', author_role='customer'))
        else:
            msg = await session.scalar(select(Message).where(Message.conversation_id == target))
            session.add(Attachment(service_center_id=refs['foreign_center'], conversation_id=target,
                message_id=msg.id, label='FOREIGN-PRIVATE', kind='photo'))
        await session.commit()
        before = (await session.execute(select(Conversation.status, Conversation.unread_activity,
            Conversation.assigned_user_id).where(Conversation.id == target))).one()
        participants_before = (await session.execute(select(Participant.id, Participant.is_following).where(
            Participant.conversation_id == target).order_by(Participant.id))).all()
    path = f'/api/v1/conversations/{target}'
    for method, url, kwargs in [('get', path, {}), ('patch', path, {'json': {'status': 'resolved'}}),
                               ('post', path+'/follow', {}), ('delete', path+'/follow', {})]:
        response = await getattr(client, method)(url, headers=refs['admin'], **kwargs)
        assert response.status_code == 404
        assert 'FOREIGN-PRIVATE' not in response.text
    async with async_session_factory() as session:
        assert (await session.execute(select(Conversation.status, Conversation.unread_activity,
            Conversation.assigned_user_id).where(Conversation.id == target))).one() == before
        assert (await session.execute(select(Participant.id, Participant.is_following).where(
            Participant.conversation_id == target).order_by(Participant.id))).all() == participants_before
