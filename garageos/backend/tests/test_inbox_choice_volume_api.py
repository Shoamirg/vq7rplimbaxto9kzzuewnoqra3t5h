"""Bounded choice reads over real large tenant sets, with normal auth.

Prepared source contracts. No collected test is claimed to have passed at runtime.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import event, text
from app.core.config import settings

from app.core.database import async_session_factory, engine
from app.models import Appointment, Customer, User, Vehicle
from app.models.invoice import Invoice
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


MODELS = {'customer': Customer, 'vehicle': Vehicle, 'appointment': Appointment,
    'case': OperationalCase, 'invoice': Invoice, 'assignee': User}


async def add_choices(refs, kind, count):
    async with async_session_factory() as session:
        password_hash = None
        if kind == 'assignee':
            exemplar = await session.get(User, uuid.UUID(refs['ids'][0]))
            password_hash = exemplar.password_hash
        rows = []
        for _ in range(count):
            tag = uuid.uuid4().hex
            common = {'service_center_id': refs['center']}
            if kind == 'customer':
                values = {'full_name': 'Choice volume ' + tag}
            elif kind == 'vehicle':
                values = {'customer_id': uuid.UUID(refs['customer']),
                    'vehicle_model_id': uuid.UUID(refs['model']), 'year': 2020}
            elif kind == 'appointment':
                values = {'customer_id': uuid.UUID(refs['customer']), 'vehicle_id': uuid.UUID(refs['vehicle']),
                    'appointment_date': datetime(2020, 1, 1, tzinfo=timezone.utc), 'appointment_time': '10:00'}
            elif kind in ['case', 'invoice']:
                values = {'customer_id': uuid.UUID(refs['customer']),
                    'vehicle_id': uuid.UUID(refs['vehicle']), 'code': tag[:24]}
                if kind == 'case':
                    values['title'] = 'Choice volume ' + tag
            else:
                values = {'role_id': refs['role'], 'email': tag + '@example.com',
                    'full_name': 'Choice volume ' + tag, 'password_hash': password_hash}
            row = MODELS[kind](**common, **values)
            rows.append(row)
        session.add_all(rows)
        await session.commit()
        return {str(row.id) for row in rows}


async def read_choices(client, refs, kind, **params):
    response = await client.get('/api/v1/conversations/choices', headers=refs['admin'],
        params={'kind': kind, 'limit': 17, **params})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize('kind', MODELS)
async def test_choice_query_work_is_bounded_after_two_thousand_rows(client, references, kind):
    refs = references
    await add_choices(refs, kind, 50)
    captured = []
    measuring = True
    def record(_conn, _cursor, statement, parameters, context, _many):
        if measuring:
            captured.append((statement, parameters,
                bool(context.compiled and getattr(context.compiled.statement, 'is_select', False))
                or statement.lstrip().lower().startswith(('select', 'with'))))
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        small = await read_choices(client, refs, kind)
        small_count = len(captured)
        assert small['total'] >= 50 and len(small['items']) == 17
        added = await add_choices(refs, kind, 2000)
        captured.clear()
        large = await read_choices(client, refs, kind)
        assert len(captured) <= small_count + 1 and len(captured) <= 12
        assert large['total'] == small['total'] + 2000
        assert len(large['items']) == 17 and large['has_more'] is True
        assert len({row['id'] for row in large['items']}) == 17
        assert any('limit' in statement.lower() and MODELS[kind].__tablename__ in statement.lower()
            for statement, _parameters, _select in captured), 'Choice rows must be bounded in SQL'
        assert not any(table in statement.lower() for statement, _parameters, _select in captured
            for table in ['conversation_messages', 'conversation_attachments', 'conversation_read_observations',
                'invoice_line_items', 'invoice_payments'])
        # Check every actual SELECT from the large request, so a bounded page
        # cannot conceal an extra whole-tenant preload. Aggregate and EXISTS
        # roots return one row; normal auth/label lookups remain bounded too.
        measuring = False
        bounded_roots = []
        async with async_session_factory() as session:
            connection = await session.connection()
            await connection.execute(text('SET LOCAL transaction_read_only = on'))
            for statement, parameters, is_select in captured:
                if not is_select:
                    continue
                result = await connection.exec_driver_sql('EXPLAIN (ANALYZE, FORMAT JSON) ' + statement, parameters)
                plan = result.scalar_one()[0]['Plan']
                returned = int(plan['Actual Rows']) * int(plan['Actual Loops'])
                bounded_roots.append((plan['Node Type'], returned))
                assert returned <= 17, 'An actual choices SELECT fetched more than the bounded page'
        assert bounded_roots
        measuring = True
        known = next(iter(added))
        exact = await read_choices(client, refs, kind, q=known, limit=1)
        assert exact['total'] == 1 and [row['id'] for row in exact['items']] == [known]
        last = await read_choices(client, refs, kind, offset=large['total'] - 1, limit=1)
        assert last['total'] == large['total'] and len(last['items']) == 1 and last['has_more'] is False
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)


async def test_choice_search_reports_unavailable_casefold_instead_of_partial_results(client, references):
    assert settings.ENVIRONMENT == 'test'
    async with async_session_factory() as session:
        assert await session.scalar(text('SELECT current_database()')) == 'garage_test'
    temporary = 'choice_qa_' + uuid.uuid4().hex
    renamed = False
    try:
        async with async_session_factory() as session:
            await session.execute(text(f'ALTER COLLATION pg_catalog."und-x-icu" RENAME TO "{temporary}"'))
            await session.commit()
            renamed = True
        response = await client.get('/api/v1/conversations/choices', headers=references['admin'],
            params={'kind': 'customer', 'q': references['customer']})
        assert response.status_code == 503, response.text
        assert response.json()['error']['code'] == 'INBOX_SEARCH_UNAVAILABLE'
        no_search = await read_choices(client, references, 'customer')
        assert no_search['total'] >= 2
    finally:
        if renamed:
            async with async_session_factory() as session:
                await session.execute(text(f'ALTER COLLATION pg_catalog."{temporary}" RENAME TO "und-x-icu"'))
                await session.commit()
    restored = await read_choices(client, references, 'customer', q=references['customer'])
    assert restored['total'] == 1 and restored['items'][0]['id'] == references['customer']
