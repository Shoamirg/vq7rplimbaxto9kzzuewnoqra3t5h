"""Garage owners manage employee identities through the authenticated API."""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, update
from app.models import ServiceCenter, User
from tests.support.auth_sessions import persisted_access
from app.core.database import async_session_factory, engine
from app.seeds.roles import seed_roles

from tests.test_staff_access_lifecycle import PASSWORD, _as_role, client, identity


@pytest_asyncio.fixture
async def owner(client, identity):
    await _as_role(identity, 'admin')
    async with async_session_factory() as session:
        await seed_roles(session)
        await session.commit()
    return await login(client, identity['email'])


def employee_data(**changes):
    return {'full_name': 'Sherzod', 'email': f'employee-{uuid.uuid4().hex}@example.com',
            'password': PASSWORD, 'role': 'mechanic', **changes}


async def login(client, email, password=PASSWORD):
    result = await client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    assert result.status_code == 200, result.text
    return {'Authorization': f"Bearer {result.json()['access_token']}"}


async def test_owner_creates_edits_and_suspends_employee_without_losing_identity(client, identity):
    await _as_role(identity, 'admin')
    async with async_session_factory() as session:
        await seed_roles(session)
        await session.commit()
    owner = await login(client, identity['email'])
    email = f'employee-{uuid.uuid4().hex}@example.com'
    created = await client.post('/api/v1/staff', headers=owner, json={
        'full_name': 'Sherzod', 'email': email, 'password': PASSWORD, 'role': 'mechanic',
    })
    assert created.status_code == 201, created.text
    employee = created.json()
    assert employee['role'] == 'mechanic'
    assert employee['is_active'] is True
    assert 'password' not in employee and 'password_hash' not in employee
    staff_token = await login(client, email)
    roster = await client.get('/api/v1/staff', headers=owner)
    assert roster.status_code == 200
    assert employee['id'] in {u['id'] for u in roster.json()['items']}
    edited = await client.patch(f"/api/v1/staff/{employee['id']}", headers=owner,
                               json={'full_name': 'Sherzod Usta', 'phone': '+998901234567'})
    assert edited.status_code == 200, edited.text
    assert edited.json()['full_name'] == 'Sherzod Usta'
    roster = (await client.get('/api/v1/mechanics', headers=owner)).json()['items']
    assert next(u for u in roster if u['id'] == employee['id'])['full_name'] == 'Sherzod Usta'
    suspended = await client.patch(f"/api/v1/staff/{employee['id']}", headers=owner,
                                  json={'is_active': False})
    assert suspended.status_code == 200
    assert (await client.get('/api/v1/auth/me', headers=staff_token)).status_code == 401
    assert (await client.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})).status_code == 401
    restored = await client.patch(f"/api/v1/staff/{employee['id']}", headers=owner, json={'is_active': True})
    assert restored.status_code == 200
    assert restored.json()['id'] == employee['id']
    assert (await client.get('/api/v1/auth/me', headers=await login(client, email))).status_code == 200


@pytest.mark.parametrize('role', ['mechanic', 'manager', 'receptionist', 'super_admin'])
async def test_non_owner_cannot_list_create_or_change_staff(client, identity, owner, role):
    employee = (await client.post('/api/v1/staff', headers=owner, json=employee_data())).json()
    await _as_role(identity, role)
    headers = await login(client, identity['email'])
    assert (await client.get('/api/v1/staff', headers=headers)).status_code == 403
    assert (await client.post('/api/v1/staff', headers=headers, json=employee_data())).status_code == 403
    assert (await client.patch(f"/api/v1/staff/{employee['id']}", headers=headers,
                              json={'is_active': False})).status_code == 403


async def test_owner_cannot_change_self_platform_identity_or_other_garage(client, identity, owner):
    protected_id = (await client.post('/api/v1/staff', headers=owner, json=employee_data())).json()['id']
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == uuid.UUID(protected_id)).values(is_super_admin=True))
        other = ServiceCenter(name='Foreign staff test')
        session.add(other)
        await session.flush()
        foreign_id = other.id
        source = await session.get(User, uuid.UUID(protected_id))
        foreign = User(service_center_id=foreign_id, role_id=source.role_id, full_name='Foreign',
                       email=f'foreign-{uuid.uuid4().hex}@example.com', password_hash=source.password_hash)
        session.add(foreign)
        await session.commit()
        foreign_user_id = foreign.id
    try:
        for uid in (identity['user'], protected_id):
            assert (await client.patch(f'/api/v1/staff/{uid}', headers=owner,
                                      json={'is_active': False})).status_code == 403
        assert (await client.patch(f'/api/v1/staff/{foreign_user_id}', headers=owner,
                                  json={'is_active': False})).status_code == 404
        items = (await client.get('/api/v1/staff', headers=owner)).json()['items']
        assert str(foreign_user_id) not in {u['id'] for u in items}
        assert next(u for u in items if u['id'] == str(identity['user']))['editable'] is False
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == foreign_id))
            await session.commit()


@pytest.mark.parametrize('changes', [{'role': 'admin'}, {'role': 'super_admin'},
    {'is_super_admin': True}, {'service_center_id': str(uuid.uuid4())},
    {'password': 'short'}, {'password': 'й' * 40}, {'full_name': '   '}])
async def test_create_rejects_privilege_injection_and_invalid_identity(client, owner, changes):
    response = await client.post('/api/v1/staff', headers=owner, json=employee_data(**changes))
    assert response.status_code == 422, response.text
    assert PASSWORD not in response.text


async def test_duplicate_email_is_generic_and_staff_search_is_literal_paginated(client, owner):
    data = employee_data(full_name='Sherzod_100%')
    employee = (await client.post('/api/v1/staff', headers=owner, json=data)).json()
    duplicate = await client.post('/api/v1/staff', headers=owner, json=data)
    assert duplicate.status_code == 409, duplicate.text
    assert data['email'] not in duplicate.text and PASSWORD not in duplicate.text
    await client.post('/api/v1/staff', headers=owner, json=employee_data(full_name='Sherzod_100%'))
    first = (await client.get('/api/v1/staff?q=100%25&page_size=1', headers=owner)).json()
    second = (await client.get('/api/v1/staff?q=100%25&page_size=1&page=2', headers=owner)).json()
    assert first['total'] == second['total'] == 2
    assert first['items'][0]['id'] != second['items'][0]['id']
    assert first['total_pages'] == 2
    for body in ({'role': 'admin'}, {'role': 'super_admin'}, {'email': 'changed@example.com'},
                 {'password': PASSWORD}, {'full_name': None}):
        assert (await client.patch(f"/api/v1/staff/{employee['id']}", headers=owner, json=body)).status_code == 422


async def test_demo_owner_and_anonymous_cannot_manage_staff(client, identity, owner):
    demo = await persisted_access({'sub': str(identity['user']), 'type': 'access', 'demo': True})
    headers = {'Authorization': f'Bearer {demo}'}
    assert (await client.get('/api/v1/staff', headers=headers)).status_code == 403
    assert (await client.post('/api/v1/staff', headers=headers, json=employee_data())).status_code == 403
    assert (await client.get('/api/v1/staff')).status_code == 401


async def test_entered_mixed_case_email_can_sign_in_with_its_initial_password(client, owner):
    data = employee_data(email=f'Employee-{uuid.uuid4().hex}@example.com')
    created = await client.post('/api/v1/staff', headers=owner, json=data)
    assert created.status_code == 201
    assert (await client.get('/api/v1/auth/me', headers=await login(client, data['email']))).status_code == 200


async def test_sql_diagnostics_do_not_record_employee_password_hash(client, owner, caplog):
    previous = engine.echo
    engine.echo = True
    try:
        result = await client.post('/api/v1/staff', headers=owner, json=employee_data())
        assert result.status_code == 201
        assert '$2b$' not in caplog.text and '$2a$' not in caplog.text
        assert PASSWORD not in caplog.text
    finally:
        engine.echo = previous
