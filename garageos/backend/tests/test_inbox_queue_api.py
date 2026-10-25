"""Inbox queues through normal password authentication and migrated PostgreSQL.

Expected pages/counts are derived from fixture facts, not application predicates.
No auth overrides, mocked responses or disabled foreign keys are used.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text, update

from app.core.database import async_session_factory, engine
from app.core.config import settings
from app.models import Brand, Customer, Vehicle, VehicleModel
from app.models.conversation import Attachment, Conversation, Message, Participant
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


@pytest_asyncio.fixture
async def inbox_rows(references, identity):
    refs = references
    origin = datetime(2020, 1, 1, tzinfo=timezone.utc)
    async with async_session_factory() as session:
        cases = [OperationalCase(service_center_id=refs['center'],
            customer_id=uuid.UUID(refs['customer']), code=f'INBOX-{i}', title='Recorded case',
            status=status, created_at=origin, sla_response_minutes=15)
            for i, status in enumerate(['new', 'resolved'])]
        session.add_all(cases)
        await session.flush()
        rows = []
        for i in range(129):
            row = Conversation(service_center_id=refs['center'],
                subject={0: 'СЕРВИС 100% _ back\\slash', 1: '1000 X backslash'}.get(i, f'Thread {i}'),
                priority='high' if i == 0 else 'low',
                status='resolved' if i == 127 else 'snoozed' if i == 128 else 'waiting_customer' if i == 1 else 'open',
                last_channel='phone' if i < 5 else 'web', conv_type='general',
                customer_id=uuid.UUID(refs['customer']),
                vehicle_id=uuid.UUID(refs['vehicle']) if i == 6 else None,
                assigned_user_id=identity['user'] if i == 2 else None,
                case_id=cases[i-3].id if i in (3, 4) else None,
                unread_messages=1 if i == 5 else 0,
                message_generation=1 if i == 5 else 0,
                last_activity_at=origin + timedelta(seconds=i//3))
            rows.append(row)
        session.add_all(rows)
        await session.flush()
        session.add_all([Message(service_center_id=refs['center'], conversation_id=rows[i].id,
            body='Recorded mention', mentions=mentions, author_role='customer', channel='web')
            for i, mentions in [(0, ['Recorded participant']), (1, [])]])
        session.add(Conversation(service_center_id=refs['foreign_center'], subject='FOREIGN-PRIVATE', status='open'))
        session.add(Conversation(service_center_id=refs['center'], subject='FOREIGN-PRIVATE',
            customer_id=uuid.UUID(refs['foreign_customer']), status='open'))
        session.add(Conversation(service_center_id=refs['center'], subject='Inactive', is_active=False))
        await session.commit()
        oracle = [dict(id=str(row.id), status=row.status, priority=row.priority,
            activity=row.last_activity_at) for row in rows]
        oracle.sort(key=lambda row: (row['activity'], row['id']), reverse=True)
        oracle.sort(key=lambda row: 0 if row['priority'] == 'high' else 2)
        return PrivateWorkshop(refs, rows=oracle, oldest=str(rows[0].id),
            waiting=str(rows[1].id), assigned=str(rows[2].id), sla=str(rows[3].id),
            resolved_case=str(cases[1].id), vehicle_thread=str(rows[6].id))


async def listing(client, refs, **params):
    response = await client.get('/api/v1/conversations', headers=refs['admin'], params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def test_complete_priority_order_and_tied_pages(client, inbox_rows):
    refs = inbox_rows
    actual = []
    for offset in range(0, 140, 17):
        page = await listing(client, refs, view='all', limit=17, offset=offset)
        assert (page['total'], page['limit'], page['offset']) == (129, 17, offset)
        actual.extend(row['id'] for row in page['items'])
    assert actual == [row['id'] for row in refs['rows']]
    assert len(set(actual)) == 129
    beyond = await listing(client, refs, view='all', offset=2147483647)
    assert beyond['items'] == [] and beyond['total'] == 129


@pytest.mark.parametrize('query', ['сервис', '100%', '_', 'back\\slash'])
async def test_old_literal_unicode_search(client, inbox_rows, query):
    page = await listing(client, inbox_rows, q=query, limit=1)
    assert page['total'] == 1
    assert [row['id'] for row in page['items']] == [inbox_rows['oldest']]
    assert page['counts']['needs_reply'] == 1 and page['counts']['waiting_customer'] == 0


@pytest.mark.parametrize('case_status,case_active,conversation_status,eligible', [
    ('new', True, 'open', True), ('new', True, 'waiting_customer', True),
    ('resolved', True, 'open', False), ('new', False, 'open', False),
    ('new', True, 'resolved', False), ('new', True, 'snoozed', False),
])
async def test_sla_timer_capability_describes_current_case_and_communication_state(
    client, inbox_rows, case_status, case_active, conversation_status, eligible,
):
    refs = inbox_rows
    async with async_session_factory() as session:
        conv = await session.get(Conversation, uuid.UUID(refs['sla']))
        await session.execute(update(OperationalCase).where(OperationalCase.id == conv.case_id).values(
            status=case_status, is_active=case_active))
        conv.status = conversation_status
        await session.commit()
    page = await listing(client, refs, view='all', q=refs['sla'])
    assert page['total'] == 1 and len(page['items']) == 1
    row = page['items'][0]
    assert row['id'] == refs['sla'] and row['case_status'] == case_status
    assert row.get('sla_tracking_active') is eligible
    assert row['sla_breached'] is eligible  # recorded 2020 deadline is long past


async def test_each_count_keeps_filters_but_not_selected_view(client, inbox_rows):
    page = await listing(client, inbox_rows, view='waiting_customer', channel='phone', type='general')
    assert page['total'] == 1 and [row['id'] for row in page['items']] == [inbox_rows['waiting']]
    assert page['counts'] == {'all': 5, 'needs_reply': 4, 'assigned_me': 1, 'mentions': 1,
        'waiting_customer': 1, 'waiting_technician': 0, 'waiting_approval': 0,
        'sla_breached': 1, 'unread': 0, 'resolved': 0, 'snoozed': 0}
    for view, key in [('mentions', 'oldest'), ('sla_breached', 'sla'), ('assigned_me', 'assigned')]:
        page = await listing(client, inbox_rows, view=view, limit=1)
        assert page['total'] == 1 and [row['id'] for row in page['items']] == [inbox_rows[key]]
    for view in ['resolved', 'snoozed']:
        page = await listing(client, inbox_rows, view=view)
        assert page['total'] == 1 and page['items'][0]['status'] == view


@pytest.mark.parametrize('params', [{'view': 'unknown'}, {'channel': 'unknown'}, {'type': 'unknown'},
    {'limit': 0}, {'limit': 101}, {'offset': -1}, {'offset': 2147483648}, {'q': 'x'*201}])
async def test_query_validation(client, inbox_rows, params):
    response = await client.get('/api/v1/conversations', headers=inbox_rows['admin'], params=params)
    assert response.status_code == 422


@pytest.mark.parametrize('edge', ['participant', 'message', 'attachment', 'vehicle', 'assigned'])
async def test_unsafe_child_or_reference_excluded_before_counts(client, inbox_rows, edge):
    refs = inbox_rows
    target = uuid.UUID(refs['oldest'])
    async with async_session_factory() as session:
        if edge == 'participant':
            session.add(Participant(service_center_id=refs['foreign_center'], conversation_id=target,
                display_name='FOREIGN-PRIVATE', role='watcher'))
        elif edge == 'message':
            session.add(Message(service_center_id=refs['foreign_center'], conversation_id=target,
                body='FOREIGN-PRIVATE', author_role='customer'))
        elif edge == 'attachment':
            msg = await session.scalar(select(Message).where(Message.conversation_id == target))
            session.add(Attachment(service_center_id=refs['center'], conversation_id=uuid.UUID(refs['waiting']),
                message_id=msg.id, label='FOREIGN-PRIVATE', kind='photo'))
        else:
            field = 'vehicle_id' if edge == 'vehicle' else 'assigned_user_id'
            value = refs['foreign_vehicle'] if edge == 'vehicle' else refs['ids'][2]
            await session.execute(update(Conversation).where(Conversation.id == target).values(**{field: uuid.UUID(value)}))
        await session.commit()
    page = await listing(client, refs, view='all', q='сервис')
    assert page['total'] == 0 and page['items'] == [] and not any(page['counts'].values())
    assert 'FOREIGN-PRIVATE' not in str(page)


async def test_local_inactive_and_transferred_history_labels_remain_searchable(client, inbox_rows):
    refs = inbox_rows
    async with async_session_factory() as session:
        await session.execute(update(Customer).where(Customer.id == uuid.UUID(refs['customer'])).values(is_active=False))
        await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(
            is_active=False, customer_id=uuid.UUID(refs['other_customer']), license_plate='01 SAVED 123'))
        await session.commit()
    page = await listing(client, refs, q='saved')
    assert page['total'] == 1 and page['items'][0]['id'] == refs['vehicle_thread']
    assert page['items'][0]['vehicle_label'].endswith('(01 SAVED 123)')
    assert page['items'][0]['customer_name']


async def test_page_query_work_does_not_load_histories_or_scale_with_page_size(client, inbox_rows):
    captured = []
    def record(_conn, _cursor, statement, _parameters, _context, _many):
        captured.append(statement)
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        await listing(client, inbox_rows, view='all', limit=1)
        small = list(captured)
        captured.clear()
        await listing(client, inbox_rows, view='all', limit=100)
        large = list(captured)
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)
    assert len(small) == len(large) and len(large) <= 16
    assert not any(sql.lstrip().lower().startswith(('select conversation_messages.',
        'select conversation_participants.', 'select conversation_attachments.')) for sql in large)


async def test_search_captured_vehicle_customer_and_case_identifiers(client, inbox_rows):
    refs = inbox_rows
    for query, target in [(refs['oldest'], refs['oldest']), (refs['vehicle'], refs['vehicle_thread']),
                          ('INBOX-0', refs['sla'])]:
        page = await listing(client, refs, view='all', q=query)
        assert page['total'] == 1 and page['items'][0]['id'] == target
    by_customer = await listing(client, refs, view='all', q=refs['customer'], limit=1)
    assert by_customer['total'] == 129 and len(by_customer['items']) == 1


@pytest.mark.parametrize('part', ['brand_model', 'model_plate'])
async def test_combined_displayed_vehicle_label_is_literal_searchable(client, inbox_rows, part):
    refs = inbox_rows
    async with async_session_factory() as session:
        brand, model = (await session.execute(select(Brand.name, VehicleModel.name).join(
            VehicleModel, VehicleModel.brand_id == Brand.id).where(
                VehicleModel.id == uuid.UUID(refs['model'])))).one()
        await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(
            license_plate='01 SAVED 123'))
        await session.commit()
    query = f'{brand} {model}' if part == 'brand_model' else f'{model} (01 SAVED 123)'
    page = await listing(client, refs, q=query.swapcase(), limit=1)
    assert page['total'] == 1 and page['counts']['needs_reply'] == 1
    assert page['items'][0]['id'] == refs['vehicle_thread']
    assert page['items'][0]['vehicle_label'] == f'{brand} {model} (01 SAVED 123)'


async def test_missing_icu_fails_search_explicitly_and_restoration_recovers(client, inbox_rows):
    assert settings.ENVIRONMENT == 'test'
    async with async_session_factory() as session:
        assert await session.scalar(text('SELECT current_database()')) in {'garage_test', 'garageos_mvp_tests'}
    temporary = 'inbox_qa_' + uuid.uuid4().hex
    renamed = False
    try:
        async with async_session_factory() as session:
            await session.execute(text(f'ALTER COLLATION pg_catalog."und-x-icu" RENAME TO "{temporary}"'))
            await session.commit()
            renamed = True
        response = await client.get('/api/v1/conversations?q=сервис', headers=inbox_rows['admin'])
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'INBOX_SEARCH_UNAVAILABLE'
        no_search = await listing(client, inbox_rows, view='all')
        assert no_search['total'] == 129
    finally:
        if renamed:
            async with async_session_factory() as session:
                await session.execute(text(f'ALTER COLLATION pg_catalog."{temporary}" RENAME TO "und-x-icu"'))
                await session.commit()
    restored = await listing(client, inbox_rows, q='сервис')
    assert restored['total'] == 1 and restored['items'][0]['id'] == inbox_rows['oldest']


async def test_sla_uses_open_active_case_and_open_communication(client, inbox_rows):
    refs = inbox_rows
    target = uuid.UUID(refs['sla'])
    for change in ['inactive_case', 'resolved_case', 'resolved_conversation']:
        async with async_session_factory() as session:
            case_id = await session.scalar(select(Conversation.case_id).where(Conversation.id == target))
            await session.execute(update(OperationalCase).where(OperationalCase.id == case_id).values(
                is_active=change != 'inactive_case', status='resolved' if change == 'resolved_case' else 'new'))
            await session.execute(update(Conversation).where(Conversation.id == target).values(
                status='resolved' if change == 'resolved_conversation' else 'open'))
            await session.commit()
        page = await listing(client, refs, view='all', channel='phone')
        assert not next(row for row in page['items'] if row['id'] == refs['sla'])['sla_breached']
        assert page['counts']['sla_breached'] == 0


async def test_queue_query_work_remains_bounded_after_large_growth(client, inbox_rows):
    refs = inbox_rows
    captured = []
    def record(_conn, _cursor, statement, _parameters, _context, _many):
        captured.append(statement)
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        small = await listing(client, refs, view='all', limit=17)
        small_count = len(captured)
        async with async_session_factory() as session:
            session.add_all([Conversation(service_center_id=refs['center'], subject=f'Older volume {i}',
                customer_id=uuid.UUID(refs['customer']), priority='low', status='open',
                last_activity_at=datetime(2010, 1, 1, tzinfo=timezone.utc)) for i in range(2000)])
            await session.commit()
            stored = await session.scalar(select(Conversation.id).where(Conversation.service_center_id == refs['center'],
                Conversation.subject == 'Older volume 1999'))
            assert stored is not None
        captured.clear()
        large = await listing(client, refs, view='all', limit=17)
        assert len(captured) == small_count and small_count <= 16
        assert large['total'] == 2129 and large['counts']['all'] == 2129
        assert large['items'] == small['items']
        last = await listing(client, refs, view='all', limit=1, offset=2128)
        assert len(last['items']) == 1 and last['items'][0]['subject'].startswith('Older volume ')
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)
