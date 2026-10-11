"""Independent normal-auth reference projection contracts; not runtime evidence.

Existing owning fixtures preserve normal password login and real PostgreSQL
transactions. Expected coordinates come from real HTTP-created records and an
independent stored Conversation read, never from the serializer under test.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select

from app.core.database import async_session_factory
from app.models import Appointment, Role, User
from app.models.conversation import Conversation
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401

PATH = '/api/v1/conversations'
FIELDS = ('customer_id', 'vehicle_id', 'appointment_id', 'case_id', 'invoice_id', 'assigned_user_id')


@pytest_asyncio.fixture
async def projection_context(client, references):
    refs = references
    async with async_session_factory() as session:
        appointment_ids = (await session.scalars(select(Appointment.id).where(
            Appointment.service_center_id == refs['center'],
            Appointment.customer_id == uuid.UUID(refs['customer']),
            Appointment.vehicle_id == uuid.UUID(refs['vehicle'])))).all()
    assert len(appointment_ids) == 1
    appointment = str(appointment_ids[0])
    case_response = await client.post('/api/v1/cases', headers=refs['admin'], json={
        'customer_id': refs['customer'], 'vehicle_id': refs['vehicle'],
        'title': 'Projection context ' + uuid.uuid4().hex, 'case_type': 'support',
    })
    assert case_response.status_code == 201
    case_id = case_response.json()['id']
    assert (await client.patch(f'/api/v1/cases/{case_id}', headers=refs['admin'],
        json={'status': 'in_progress'})).status_code == 200
    invoice_response = await client.post('/api/v1/invoices', headers=refs['admin'], json={
        'kind': 'estimate', 'customer_id': refs['customer'], 'vehicle_id': refs['vehicle'],
        'appointment_id': appointment, 'case_id': case_id,
    })
    assert invoice_response.status_code == 201
    return PrivateWorkshop(refs, expected={
        'customer_id': refs['customer'], 'vehicle_id': refs['vehicle'],
        'appointment_id': appointment, 'case_id': case_id,
        'invoice_id': invoice_response.json()['id'], 'assigned_user_id': refs['ids'][0],
    })


async def stored_coordinates(saved_id, center):
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(saved_id))
        assert row is not None and row.service_center_id == center
        return {field: str(getattr(row, field)) if getattr(row, field) is not None else None for field in FIELDS}


async def visible_row(client, headers, saved_id):
    response = await client.get(PATH, headers=headers, params={'view': 'all', 'q': saved_id, 'limit': 50, 'offset': 0})
    assert response.status_code == 200
    page = response.json()
    assert page['total'] == 1 and len(page['items']) == 1
    assert page['items'][0]['id'] == saved_id
    return page['items'][0]


@pytest.mark.parametrize('surface', ['create', 'list', 'detail'])
async def test_all_six_reference_ids_are_returned_from_the_actual_persisted_aggregate(client, projection_context, surface):
    refs = projection_context
    subject = 'All six projected references ' + uuid.uuid4().hex
    response = await client.post(PATH, headers=refs['admin'], json={
        'subject': subject, 'conv_type': 'support', 'priority': 'high', **refs['expected'],
    })
    assert response.status_code == 201
    created = response.json()
    saved_id = created['id']
    # Run the independent durability oracle before checking response fields.
    assert await stored_coordinates(saved_id, refs['center']) == refs['expected']
    if surface == 'list':
        result = await visible_row(client, refs['admin'], saved_id)
    elif surface == 'detail':
        detail = await client.get(f'{PATH}/{saved_id}', headers=refs['admin'])
        assert detail.status_code == 200
        result = detail.json()
    else:
        result = created
    assert result['id'] == saved_id and result['subject'] == subject
    assert {field: result[field] for field in FIELDS} == refs['expected']
    assert result['status'] == 'open'
    async with async_session_factory() as session:
        assert await session.scalar(select(OperationalCase.status).where(
            OperationalCase.id == uuid.UUID(refs['expected']['case_id']))) == 'in_progress'


async def test_omitted_and_explicit_null_optional_references_remain_null_on_create_list_and_detail(client, projection_context):
    refs = projection_context
    expected = {field: None for field in FIELDS}
    saved = []
    for explicit_nulls in [False, True]:
        body = {'subject': None, **({field: None for field in FIELDS} if explicit_nulls else {})}
        response = await client.post(PATH, headers=refs['admin'], json=body)
        assert response.status_code == 201
        created = response.json()
        saved_id = created['id']
        assert saved_id not in saved
        saved.append(saved_id)
        assert await stored_coordinates(saved_id, refs['center']) == expected
        listed = await visible_row(client, refs['admin'], saved_id)
        detail = await client.get(f'{PATH}/{saved_id}', headers=refs['admin'])
        assert detail.status_code == 200
        for result in [created, listed, detail.json()]:
            assert result['id'] == saved_id and result['subject'] is None
            assert {field: result[field] for field in FIELDS} == expected


async def test_new_projection_does_not_expose_or_accept_another_garages_linked_aggregate(client, projection_context):
    refs = projection_context
    created = await client.post(PATH, headers=refs['admin'], json={
        'subject': 'Private linked projection ' + uuid.uuid4().hex, **refs['expected'],
    })
    assert created.status_code == 201
    saved_id = created.json()['id']
    assert await stored_coordinates(saved_id, refs['center']) == refs['expected']
    foreign_id, email = uuid.uuid4(), uuid.uuid4().hex + '@example.com'
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == 'admin'))
        assert role is not None
        exemplar = await session.get(User, uuid.UUID(refs['ids'][2]))
        session.add(User(id=foreign_id, service_center_id=refs['foreign_center'], role_id=role.id,
            email=email, full_name='Private projection operator', password_hash=exemplar.password_hash))
        await session.commit()
    try:
        login = await client.post('/api/v1/auth/login', json={'email': email, 'password': PASSWORD})
        assert login.status_code == 200
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        profile = await client.get('/api/v1/auth/me', headers=headers)
        assert profile.status_code == 200
        assert profile.json()['id'] == str(foreign_id)
        assert profile.json()['service_center_id'] == str(refs['foreign_center'])
        assert 'staff.read' in profile.json()['permissions']
        listed = await client.get(PATH, headers=headers, params={'view': 'all', 'q': saved_id})
        assert listed.status_code == 200 and listed.json()['items'] == [] and listed.json()['total'] == 0
        detail = await client.get(f'{PATH}/{saved_id}', headers=headers)
        assert detail.status_code == 404
        for linked_id in refs['expected'].values():
            assert linked_id not in detail.text
        async with async_session_factory() as session:
            before = await session.scalar(select(func.count()).select_from(Conversation).where(
                Conversation.service_center_id == refs['foreign_center']))
        rejected = await client.post(PATH, headers=headers, json={'subject': 'Rejected foreign links', **refs['expected']})
        assert rejected.status_code == 404
        async with async_session_factory() as session:
            after = await session.scalar(select(func.count()).select_from(Conversation).where(
                Conversation.service_center_id == refs['foreign_center']))
        assert after == before
        assert await stored_coordinates(saved_id, refs['center']) == refs['expected']
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(User).where(User.id == foreign_id))
            await session.commit()
