"""Complete case reads through password-authenticated HTTP and real PostgreSQL.

Foreign keys, tenant dependencies and UnitOfWork are real. SQL recording measures
the actual request; only asynchronous event delivery is replaced with a recorder.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text, update
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.events import event_bus
from app.models import Brand, Customer, User, Vehicle, VehicleModel
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, snapshot  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401

OPEN = ('new', 'acknowledged', 'assigned', 'en_route', 'in_progress', 'waiting_customer')
TYPES = ('emergency', 'support', 'towing', 'warranty', 'vip')


@pytest_asyncio.fixture
async def case_rows(references):
    refs = references
    now = datetime(2020, 1, 1, tzinfo=timezone.utc)
    async with async_session_factory() as session:
        named = Customer(service_center_id=refs['center'], full_name='МИЖОЗ OʻZBEK Search')
        session.add(named)
        await session.flush()
        rows = []
        for i in range(81):
            # Three rows share each timestamp; explicit UUIDs make the tie oracle independent.
            row = OperationalCase(id=uuid.UUID(int=i+1), service_center_id=refs['center'],
                customer_id=named.id if i in (5, 6) else uuid.UUID(refs['customer']),
                code=f'OWN-{i:04}', title={0: 'Older Needle EN', 1: 'СЕРВИС ЗАМЕНА',
                    2: 'OʻZBEK TAʼMIR', 3: '100% _ back\\slash', 4: '1000 X backslash'}.get(i, 'Local assistance'),
                case_type='legacy_type' if i == 80 else TYPES[i % 5], status=OPEN[i % 6] if i < 75 else ('resolved' if i < 78 else 'closed' if i < 80 else 'legacy_pending'),
                vehicle_id=uuid.UUID(refs['vehicle']) if i in (7, 8) else None,
                severity='medium', sla_response_minutes=15, created_at=now+timedelta(seconds=i//3))
            rows.append(row)
        # UUIDs are unique per test because these centers are removed on teardown.
        session.add_all(rows)
        for i, values in enumerate([
            dict(customer_id=uuid.UUID(refs['foreign_customer'])),
            dict(vehicle_id=uuid.UUID(refs['foreign_vehicle'])),
            dict(assigned_user_id=uuid.UUID(refs['ids'][2])), dict(is_active=False),
        ]):
            session.add(OperationalCase(service_center_id=refs['center'],
                customer_id=values.pop('customer_id', uuid.UUID(refs['customer'])),
                code=f'UNSAFE-{i}', title='FOREIGN-PRIVATE', status='new', **values))
        session.add(OperationalCase(service_center_id=refs['foreign_center'],
            customer_id=uuid.UUID(refs['foreign_customer']), code='FOREIGN', title='Older Needle EN', status='new'))
        await session.commit()
        oracle = [dict(id=str(r.id), status=r.status, case_type=r.case_type, created_at=r.created_at) for r in rows]
        oracle.sort(key=lambda r: (r['created_at'], r['id']), reverse=True)
        return PrivateWorkshop(refs, rows=oracle, named=str(named.id))


async def listing(client, refs, **params):
    result = await client.get('/api/v1/cases', headers=refs['admin'], params=params)
    assert result.status_code == 200, result.text
    return result.json()


def expected(refs, status='active', case_type=None):
    return [r for r in refs['rows'] if
        (status not in ('active', 'resolved') or
         (r['status'] not in ('resolved', 'closed') if status == 'active' else r['status'] in ('resolved', 'closed'))) and
        (not case_type or case_type == 'all' or r['case_type'] == case_type)]


async def test_default_and_complete_tied_page_traversal_with_independent_counts(client, case_rows):
    refs = case_rows
    first = await listing(client, refs)
    assert len(first['items']) == 60
    assert (first['total'], first['active_count'], first['limit'], first['offset']) == (76, 75, 60, 0)
    found = []
    for offset in range(0, 100, 17):
        page = await listing(client, refs, limit=17, offset=offset)
        assert (page['total'], page['active_count'], page['limit'], page['offset']) == (76, 75, 17, offset)
        found.extend(r['id'] for r in page['items'])
    assert found == [r['id'] for r in expected(refs)]
    assert len(set(found)) == 76
    beyond = await listing(client, refs, offset=2147483647)
    assert beyond['items'] == [] and beyond['total'] == 76 and beyond['active_count'] == 75


async def test_customer_filter_is_tenant_scoped_and_applies_before_case_paging(client, case_rows):
    refs = case_rows
    complete = await listing(client, refs, status='active', limit=100)
    expected_ids = [item['id'] for item in complete['items'] if item['customer_id'] == refs['customer']]
    actual_ids = []
    for offset in range(0, len(expected_ids), 17):
        page = await listing(client, refs, status='active', customer_id=refs['customer'], limit=17, offset=offset)
        assert page['total'] == len(expected_ids)
        actual_ids.extend(item['id'] for item in page['items'])
    assert actual_ids == expected_ids
    foreign = await listing(client, refs, status='all', customer_id=refs['foreign_customer'], limit=100)
    assert foreign['items'] == [] and foreign['total'] == 0


@pytest.mark.parametrize('status', ['active', 'resolved', 'all', 'unknown'])
@pytest.mark.parametrize('case_type', [None, 'all', *TYPES, 'legacy_type'])
async def test_filters_count_full_results_and_preserve_legacy_semantics(client, case_rows, status, case_type):
    params = {'status': status, 'limit': 100}
    if case_type is not None:
        params['type'] = case_type
    result = await listing(client, case_rows, **params)
    oracle = expected(case_rows, status, case_type)
    assert [r['id'] for r in result['items']] == [r['id'] for r in oracle]
    assert result['total'] == len(oracle)
    assert result['active_count'] == sum(r['status'] in OPEN for r in oracle)


@pytest.mark.parametrize('query,ids', [
    ('older needle', [1]), ('OWN-0000', [1]), ('  сервис замена  ', [2]),
    ('oʻzbek taʼmir', [3]), ('мижоз', [6, 7]), ('100%', [4]), ('_', [4]),
    ('back\\slash', [4]), ('FOREIGN-PRIVATE', []), ('no match', []),
])
async def test_literal_unicode_search_reaches_old_rows_and_scopes_customer_names(client, case_rows, query, ids):
    result = await listing(client, case_rows, q=query, limit=1)
    expected_ids = {str(uuid.UUID(int=i)) for i in ids}
    assert result['total'] == len(expected_ids) and result['active_count'] == len(expected_ids)
    actual = []
    for offset in range(len(expected_ids)):
        page = await listing(client, case_rows, q=query, limit=1, offset=offset)
        actual.extend(row['id'] for row in page['items'])
    assert set(actual) == expected_ids
    beyond = await listing(client, case_rows, q=query, offset=100)
    assert beyond['items'] == [] and beyond['total'] == len(expected_ids)


@pytest.mark.parametrize('query', ['', '   '])
async def test_empty_search_is_no_search(client, case_rows, query):
    base = await listing(client, case_rows, limit=10)
    searched = await listing(client, case_rows, q=query, limit=10)
    assert [r['id'] for r in searched['items']] == [r['id'] for r in base['items']]
    assert searched['total'] == base['total'] == 76


async def test_search_combines_with_status_and_type_before_counts(client, case_rows):
    resolved = await listing(client, case_rows, status='resolved', type='emergency', q='own-0075', offset=10)
    assert resolved['items'] == [] and resolved['total'] == 1 and resolved['active_count'] == 0
    active = await listing(client, case_rows, q='own-0075')
    assert active['items'] == [] and active['total'] == active['active_count'] == 0
    wrong_type = await listing(client, case_rows, q='older needle', type='vip')
    assert wrong_type['items'] == [] and wrong_type['total'] == wrong_type['active_count'] == 0
    legacy = await listing(client, case_rows, q='own-0080', type='legacy_type')
    assert legacy['total'] == 1 and legacy['active_count'] == 0 and not legacy['items'][0]['is_open']


@pytest.mark.parametrize('params', [
    {'limit': 0}, {'limit': 101}, {'limit': 'invalid'}, {'offset': -1},
    {'offset': 2147483648}, {'offset': 10**100}, {'offset': 'invalid'}, {'q': 'x'*201},
])
async def test_invalid_query_returns_422_without_reads_or_writes(client, case_rows, params, monkeypatch):
    before, events = await snapshot(case_rows), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    result = await client.get('/api/v1/cases', headers=case_rows['admin'], params=params)
    assert result.status_code == 422
    assert await snapshot(case_rows) == before and events == []


async def test_history_and_optional_vehicle_labels_keep_existing_format(client, case_rows):
    refs = case_rows
    async with async_session_factory() as session:
        await session.execute(update(Customer).where(Customer.id == uuid.UUID(refs['named'])).values(is_active=False))
        await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(
            customer_id=uuid.UUID(refs['other_customer']), license_plate=None))
        names = (await session.execute(select(Brand.name, VehicleModel.name).join(
            VehicleModel, VehicleModel.brand_id == Brand.id).where(VehicleModel.id == uuid.UUID(refs['model'])))).one()
        await session.commit()
    plateless = await listing(client, refs, limit=100)
    assert {r['vehicle_label'] for r in plateless['items'] if r['vehicle_id'] == refs['vehicle']} == {f'{names[0]} {names[1]}'}
    async with async_session_factory() as session:
        await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(license_plate='01 ABC 123'))
        await session.commit()
    found = await listing(client, refs, q='МИЖОЗ')
    assert found['total'] == 2 and {r['customer_name'] for r in found['items']} == {'МИЖОЗ OʻZBEK Search'}
    page = await listing(client, refs, limit=100)
    vehicle_items = [r for r in page['items'] if r['vehicle_id'] == refs['vehicle']]
    assert len(vehicle_items) == 2
    assert {r['vehicle_label'] for r in vehicle_items} == {f'{names[0]} {names[1]} (01 ABC 123)'}
    assert all('vehicle_label' not in r for r in page['items'] if r['vehicle_id'] is None)
    async with async_session_factory() as session:
        await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(is_active=False))
        await session.commit()
    inactive = await listing(client, refs, limit=100)
    assert inactive['total'] == 76
    assert all(r['vehicle_label'] is None for r in inactive['items'] if r['vehicle_id'] == refs['vehicle'])


async def test_page_queries_do_not_load_unused_collections_or_grow_per_row(client, case_rows):
    async with async_session_factory() as session:
        session.add_all([Vehicle(service_center_id=case_rows['center'], customer_id=uuid.UUID(case_rows['customer']),
            vehicle_model_id=uuid.UUID(case_rows['model']), year=2024) for _ in range(25)])
        await session.execute(update(OperationalCase).where(
            OperationalCase.service_center_id == case_rows['center'], OperationalCase.code.like('OWN-%')).values(
                vehicle_id=uuid.UUID(case_rows['vehicle'])))
        await session.commit()
    statements = []
    def record(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        small = await listing(client, case_rows, limit=1)
        small_sql = list(statements)
        statements.clear()
        large = await listing(client, case_rows, limit=60)
        large_sql = list(statements)
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)
    assert len(small['items']) == 1 and len(large['items']) == 60
    assert len(large_sql) <= 20 and len(large_sql)-len(small_sql) <= 3
    assert not any('from appointments' in sql or 'from service_records' in sql or 'from maintenance_rules' in sql for sql in large_sql)


async def test_list_search_has_no_events_and_preserves_real_role_policy(client, case_rows, identity, monkeypatch):
    refs = case_rows
    email = f'case-list-{uuid.uuid4().hex}@example.com'
    account = await client.post(f"/api/v1/customers/{refs['customer']}/account", headers=refs['admin'],
        json={'email': email, 'password': PASSWORD})
    assert account.status_code == 201
    login = await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})
    assert login.status_code == 200
    customer = PrivateWorkshop(headers={'Authorization': 'Bearer '+login.json()['access_token']})
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    for headers in refs['mechanics']:
        assert (await client.get('/api/v1/cases?q=older', headers=headers)).status_code == 403
    assert (await client.get('/api/v1/cases?q=older', headers=customer['headers'])).status_code == 401
    monkeypatch.setattr(settings, 'DEMO_MODE_ENABLED', True)
    monkeypatch.setattr(settings, 'DEMO_EMAIL', identity['email'])
    demo = await client.post('/api/v1/auth/demo')
    assert demo.status_code == 200
    private = PrivateWorkshop(headers={'Authorization': 'Bearer '+demo.json()['access_token']})
    read = await client.get('/api/v1/cases?q=older', headers=private['headers'])
    assert read.status_code == 200 and read.json()['total'] == 1
    await listing(client, refs, q='Older')
    assert await snapshot(refs) == before and events == []


async def test_missing_icu_returns_structured_503_but_no_search_and_restored_search_work(client, case_rows):
    # This controlled DDL fixture is confined to the dedicated test database.
    assert settings.ENVIRONMENT == 'test'
    async with async_session_factory() as session:
        assert await session.scalar(text('SELECT current_database()')) == 'garage_test'
    temporary = 'case_list_qa_'+uuid.uuid4().hex
    renamed = False
    try:
        async with async_session_factory() as session:
            await session.execute(text(f'ALTER COLLATION pg_catalog."und-x-icu" RENAME TO "{temporary}"'))
            await session.commit()
            renamed = True
        response = await client.get('/api/v1/cases?q=older', headers=case_rows['admin'])
        assert response.status_code == 503, response.text
        assert response.json()['error']['code'] == 'CASE_SEARCH_UNAVAILABLE'
        no_search = await listing(client, case_rows)
        assert no_search['total'] == 76
    finally:
        if renamed:
            async with async_session_factory() as session:
                await session.execute(text(f'ALTER COLLATION pg_catalog."{temporary}" RENAME TO "und-x-icu"'))
                await session.commit()
    restored = await listing(client, case_rows, q='older')
    assert restored['total'] == 1 and len(restored['items']) == 1


async def test_unsupported_encoding_uses_actual_resolution_and_returns_503_without_breaking_listing():
    assert settings.ENVIRONMENT == 'test'
    database = 'case_search_encoding_qa_'+uuid.uuid4().hex
    admin = create_async_engine(engine.url, poolclass=NullPool)
    created = False
    try:
        async with admin.connect() as connection:
            assert await connection.scalar(text('SELECT current_database()')) == 'garage_test'
        async with admin.connect() as connection:
            connection = await connection.execution_options(isolation_level='AUTOCOMMIT')
            await connection.execute(text(f'CREATE DATABASE "{database}" TEMPLATE template0 ENCODING \'SQL_ASCII\' LOCALE_PROVIDER libc LC_COLLATE \'C\' LC_CTYPE \'C\''))
            created = True
        env = dict(os.environ, DATABASE_URL=engine.url.set(database=database).render_as_string(hide_password=False))
        async def run(*args):
            process = await asyncio.create_subprocess_exec(sys.executable, *args, env=env,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                await process.communicate()
                raise
            assert process.returncode == 0, stderr.decode('utf-8', errors='replace')[-2000:]
            return stdout.decode('utf-8')
        await run('-m', 'alembic', 'upgrade', 'head')
        result = json.loads((await run('-m', 'tests.support.case_search_encoding')).strip().splitlines()[-1])
        assert result['no_search_status'] == 200 and result['search_status'] == 503
        assert result['error_code'] == 'CASE_SEARCH_UNAVAILABLE'
        assert result['real_password_auth'] and result['no_dependency_overrides']
    finally:
        try:
            if created:
                async with admin.connect() as connection:
                    connection = await connection.execution_options(isolation_level='AUTOCOMMIT')
                    await connection.execute(text(f'DROP DATABASE "{database}"'))
                    assert await connection.scalar(text('SELECT count(*) FROM pg_database WHERE datname=:name'), {'name': database}) == 0
        finally:
            await admin.dispose()
