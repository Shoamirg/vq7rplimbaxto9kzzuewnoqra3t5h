"""Prepared initial choices contracts; collect-only is not runtime evidence.

Use the normal password-authenticated HTTP / migrated PostgreSQL test seams.
Expected identities come from fixture facts, not production query helpers.
Additional linked-edge, context, query-volume and browser contracts remain due.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, update

from app.core.database import async_session_factory
from app.models import Customer, Role, User
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, snapshot  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401


PATH = '/api/v1/conversations/choices'
KINDS = ['customer', 'vehicle', 'appointment', 'case', 'invoice', 'assignee']


async def choices(client, refs, **params):
    response = await client.get(PATH, headers=refs['admin'], params=params)
    assert response.status_code == 200, response.text
    page = response.json()
    assert set(page) == {'kind', 'items', 'total', 'limit', 'offset', 'has_more'}
    assert page['kind'] == params['kind']
    assert all(set(row) <= {'id', 'label', 'customer_id', 'vehicle_id', 'role'}
        and isinstance(row['label'], str) and row['label'].strip()
        and str(uuid.UUID(row['id'])) == row['id'] for row in page['items'])
    return page


@pytest.mark.parametrize('params', [
    {}, {'kind': 'staff'}, {'kind': ''}, {'kind': 'customer', 'limit': 0},
    {'kind': 'customer', 'limit': 101}, {'kind': 'customer', 'offset': -1},
    {'kind': 'customer', 'offset': 2147483648},
    {'kind': 'customer', 'q': 'x' * 201},
    {'kind': 'vehicle', 'customer_id': 'not-a-uuid'},
    {'kind': 'case', 'vehicle_id': 'not-a-uuid'},
])
async def test_choice_input_shape_is_bounded(client, references, params):
    before = await snapshot(references)
    response = await client.get(PATH, headers=references['admin'], params=params)
    assert response.status_code == 422, response.text
    assert await snapshot(references) == before


@pytest.mark.parametrize('kind', KINDS)
async def test_every_choice_kind_has_a_read_only_minimal_projection(client, references, kind):
    before = await snapshot(references)
    page = await choices(client, references, kind=kind, limit=1, offset=0)
    assert page['total'] >= len(page['items'])
    assert len(page['items']) <= 1
    assert (page['limit'], page['offset']) == (1, 0)
    assert page['has_more'] is (page['total'] > len(page['items']))
    assert 'FOREIGN-PRIVATE' not in str(page)
    assert await snapshot(references) == before


@pytest_asyncio.fixture
async def customer_choices(references):
    refs = references
    tag = 'Choice-' + uuid.uuid4().hex
    origin = datetime(2020, 1, 1, tzinfo=timezone.utc)
    prefix = uuid.uuid4().int & ~((1 << 64) - 1)
    rows = [Customer(id=uuid.UUID(int=prefix | (0x8000000000000000 + i)),
        service_center_id=refs['center'], full_name=tag, created_at=origin,
        email=f'private-{i}@example.com', notes='PRIVATE-NOTES') for i in range(129)]
    literal = Customer(service_center_id=refs['center'],
        full_name=tag + ' СЕРВИС 100% _ back\\slash', created_at=origin)
    decoy = Customer(service_center_id=refs['center'],
        full_name=tag + ' 1000 X backslash', created_at=origin)
    async with async_session_factory() as session:
        session.add_all(rows + [literal, decoy,
            Customer(service_center_id=refs['foreign_center'], full_name=tag),
            Customer(service_center_id=refs['center'], full_name=tag, is_active=False)])
        await session.commit()
        return PrivateWorkshop(refs, tag=tag, tied_ids=sorted(str(row.id) for row in rows),
            literal_id=str(literal.id), extra_ids={str(literal.id), str(decoy.id)})


async def test_old_same_name_choices_have_complete_deterministic_uuid_pages(client, customer_choices):
    refs = customer_choices
    actual = []
    for offset, length in [(0, 50), (50, 50), (100, 31)]:
        page = await choices(client, refs, kind='customer', q=refs['tag'], limit=50, offset=offset)
        assert (page['total'], page['limit'], page['offset']) == (131, 50, offset)
        assert len(page['items']) == length
        assert page['has_more'] is (offset < 100)
        actual.extend(row['id'] for row in page['items'])
        assert 'PRIVATE-NOTES' not in str(page) and '@example.com' not in str(page)
    assert len(set(actual)) == 131
    assert set(actual) == set(refs['tied_ids']) | refs['extra_ids']
    assert [item for item in actual if item in refs['tied_ids']] == refs['tied_ids']
    beyond = await choices(client, refs, kind='customer', q=refs['tag'], offset=2147483647)
    assert beyond['items'] == [] and beyond['total'] == 131 and beyond['has_more'] is False
    selected = await choices(client, refs, kind='customer', q=refs['tied_ids'][-1])
    assert selected['total'] == 1 and selected['items'][0]['id'] == refs['tied_ids'][-1]


@pytest.mark.parametrize('query', ['сервис', '100%', '_', 'back\\slash'])
async def test_choice_search_treats_unicode_and_wildcards_literally(client, customer_choices, query):
    refs = customer_choices
    async with async_session_factory() as session:
        await session.execute(update(Customer).where(Customer.id == uuid.UUID(refs['literal_id'])).values(
            full_name=refs['tag'] + ' ' + query.upper()))
        await session.commit()
    page = await choices(client, refs, kind='customer', q=refs['tag'] + ' ' + query)
    # The complete query is a literal substring, including SQL wildcard characters.
    assert page['total'] == 1
    assert [row['id'] for row in page['items']] == [refs['literal_id']]


@pytest_asyncio.fixture
async def staff_choices(references):
    refs = references
    tag = 'Staff-choice-' + uuid.uuid4().hex
    async with async_session_factory() as session:
        exemplar = await session.get(User, uuid.UUID(refs['ids'][0]))
        rows = []
        for name in ['admin', 'manager', 'receptionist', 'mechanic', 'super_admin', 'customer']:
            role = await session.scalar(select(Role).where(Role.name == name))
            if role is None:
                role = Role(name=name)
                session.add(role)
                await session.flush()
            row = User(service_center_id=refs['center'], role_id=role.id,
                full_name=tag, email=f'{uuid.uuid4().hex}@example.com',
                password_hash=exemplar.password_hash)
            rows.append((name, row))
            session.add(row)
        inactive = User(service_center_id=refs['center'], role_id=exemplar.role_id,
            full_name=tag, email=f'{uuid.uuid4().hex}@example.com',
            password_hash=exemplar.password_hash, is_active=False)
        foreign = User(service_center_id=refs['foreign_center'], role_id=exemplar.role_id,
            full_name=tag, email=f'{uuid.uuid4().hex}@example.com',
            password_hash=exemplar.password_hash)
        session.add_all([inactive, foreign])
        await session.commit()
        return PrivateWorkshop(refs, tag=tag,
            eligible={str(row.id): name for name, row in rows if name != 'customer'},
            eligible_emails={name: row.email for name, row in rows if name != 'customer'},
            excluded={str(row.id) for name, row in rows if name == 'customer'} | {str(inactive.id), str(foreign.id)})


@pytest.mark.parametrize('caller_role', ['manager', 'receptionist'])
async def test_assignee_choices_include_all_eligible_roles_without_owner_permissions(client, staff_choices, caller_role):
    refs = staff_choices
    page = await choices(client, refs, kind='assignee', q=refs['tag'])
    assert page['total'] == 5
    assert {row['id']: row['role'] for row in page['items']} == refs['eligible']
    login = await client.post('/api/v1/auth/login', json={
        'email': refs['eligible_emails'][caller_role], 'password': PASSWORD})
    assert login.status_code == 200
    ordinary_headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
    response = await client.get(PATH, headers=ordinary_headers, params={'kind': 'assignee', 'q': refs['tag']})
    assert response.status_code == 200, response.text
    assert {row['id']: row['role'] for row in response.json()['items']} == refs['eligible']
    assert (await client.get('/api/v1/staff', headers=ordinary_headers)).status_code == 403
    assert (await client.get(PATH, headers=refs['mechanics'][0], params={'kind': 'assignee'})).status_code == 403
    assert (await client.get('/api/v1/staff', headers=refs['mechanics'][0])).status_code == 403
    assert refs['excluded'].isdisjoint(row['id'] for row in page['items'])


@pytest.mark.parametrize('suspend', ['user', 'role'])
async def test_assignee_choices_recheck_current_eligibility(client, staff_choices, suspend):
    refs = staff_choices
    target = next(key for key, role in refs['eligible'].items() if role == 'mechanic')
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(target))
        model, key = (User, user.id) if suspend == 'user' else (Role, user.role_id)
        await session.execute(update(model).where(model.id == key).values(is_active=False))
        await session.commit()
    page = await choices(client, refs, kind='assignee', q=refs['tag'])
    expected = {key: role for key, role in refs['eligible'].items() if key != target}
    assert page['total'] == 4
    assert {row['id']: row['role'] for row in page['items']} == expected
