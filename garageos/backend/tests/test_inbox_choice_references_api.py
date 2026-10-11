"""Choice eligibility must agree with normal conversation creation.

Prepared contracts only until executed against migrated real PostgreSQL.
Foreign-key constraints remain enabled, including compromised legacy edges.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, update

from app.core.database import async_session_factory
from app.models import Appointment, Customer, Role, ServiceCenter, User, Vehicle
from app.core.config import settings
from app.models.conversation import Conversation
from app.models.invoice import Invoice
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, snapshot  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401


PATH = '/api/v1/conversations/choices'
MODELS = {'customer': Customer, 'vehicle': Vehicle, 'appointment': Appointment,
    'case': OperationalCase, 'invoice': Invoice, 'assignee': User}
FIELDS = {kind: 'assigned_user_id' if kind == 'assignee' else kind + '_id' for kind in MODELS}


@pytest_asyncio.fixture
async def owning_choices(references):
    refs = references
    async with async_session_factory() as session:
        appointment = await session.scalar(select(Appointment.id).where(
            Appointment.service_center_id == refs['center'],
            Appointment.customer_id == uuid.UUID(refs['customer']),
            Appointment.vehicle_id == uuid.UUID(refs['vehicle'])))
        assert appointment is not None
        local_case = OperationalCase(service_center_id=refs['center'],
            code=uuid.uuid4().hex[:24], title='Recorded choice case',
            description='PRIVATE-CHOICE-CASE-NOTES',
            customer_id=uuid.UUID(refs['customer']), vehicle_id=uuid.UUID(refs['vehicle']),
            assigned_user_id=uuid.UUID(refs['ids'][0]), status='in_progress')
        local_invoice = Invoice(service_center_id=refs['center'], code=uuid.uuid4().hex[:24],
            customer_id=uuid.UUID(refs['customer']), vehicle_id=uuid.UUID(refs['vehicle']),
            notes='PRIVATE-CHOICE-INVOICE-NOTES', total=9876, balance=8765)
        foreign_case = OperationalCase(service_center_id=refs['foreign_center'],
            code=uuid.uuid4().hex[:24], title='FOREIGN-PRIVATE-CHOICE',
            customer_id=uuid.UUID(refs['foreign_customer']), vehicle_id=uuid.UUID(refs['foreign_vehicle']))
        foreign_invoice = Invoice(service_center_id=refs['foreign_center'], code=uuid.uuid4().hex[:24],
            customer_id=uuid.UUID(refs['foreign_customer']), vehicle_id=uuid.UUID(refs['foreign_vehicle']))
        foreign_appointment = Appointment(service_center_id=refs['foreign_center'],
            customer_id=uuid.UUID(refs['foreign_customer']), vehicle_id=uuid.UUID(refs['foreign_vehicle']),
            appointment_date=datetime(2020, 1, 1, tzinfo=timezone.utc), appointment_time='10:00')
        session.add_all([local_case, local_invoice, foreign_case, foreign_invoice, foreign_appointment])
        await session.execute(update(Customer).where(Customer.id == uuid.UUID(refs['customer'])).values(
            email='PRIVATE-CHOICE@example.com', notes='PRIVATE-CHOICE-CUSTOMER-NOTES'))
        await session.execute(update(Appointment).where(Appointment.id == appointment).values(
            notes='PRIVATE-CHOICE-APPOINTMENT-NOTES'))
        await session.commit()
        return PrivateWorkshop(refs, local_choices={
            'customer': refs['customer'], 'vehicle': refs['vehicle'],
            'appointment': str(appointment), 'case': str(local_case.id),
            'invoice': str(local_invoice.id), 'assignee': refs['ids'][0]},
            foreign_choices={'customer': refs['foreign_customer'], 'vehicle': refs['foreign_vehicle'],
                'appointment': str(foreign_appointment.id), 'case': str(foreign_case.id),
                'invoice': str(foreign_invoice.id), 'assignee': refs['ids'][2]})


async def page_for(client, refs, kind, target, **context):
    response = await client.get(PATH, headers=refs['admin'],
        params={'kind': kind, 'q': target, **context})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['kind'] == kind
    assert all(set(row) <= {'id', 'label', 'customer_id', 'vehicle_id', 'role'}
        and isinstance(row.get('label'), str) and row['label'].strip()
        and str(uuid.UUID(row['id'])) == row['id'] for row in result['items'])
    assert 'PRIVATE-CHOICE' not in str(result)
    assert 'FOREIGN-PRIVATE' not in str(result)
    return result


async def create_choice(client, refs, kind, target, **context):
    return await client.post('/api/v1/conversations', headers=refs['admin'],
        json={'subject': 'Recorded UUID choice ' + uuid.uuid4().hex, FIELDS[kind]: target, **context})


@pytest.mark.parametrize('kind', MODELS)
async def test_visible_choice_creates_the_actual_uuid_without_changing_case_status(client, owning_choices, kind):
    refs = owning_choices
    target = refs['local_choices'][kind]
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target)
    assert page['total'] == 1 and [row['id'] for row in page['items']] == [target]
    assert await snapshot(refs) == before
    if kind in ['vehicle', 'appointment', 'case', 'invoice']:
        assert page['items'][0]['customer_id'] == refs['customer']
    if kind in ['appointment', 'case', 'invoice']:
        assert page['items'][0]['vehicle_id'] == refs['vehicle']
    response = await create_choice(client, refs, kind, target)
    assert response.status_code == 201, response.text
    saved = response.json()['id']
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(saved))
        assert str(getattr(row, FIELDS[kind])) == target
        assert row.service_center_id == refs['center'] and row.status == 'open'
        assert await session.scalar(select(OperationalCase.status).where(
            OperationalCase.id == uuid.UUID(refs['local_choices']['case']))) == 'in_progress'


@pytest.mark.parametrize('kind', MODELS)
@pytest.mark.parametrize('invalid', ['foreign', 'inactive', 'missing'])
async def test_unavailable_choice_is_not_offered_or_accepted_as_a_new_link(client, owning_choices, kind, invalid):
    refs = owning_choices
    target = (refs['foreign_choices'][kind] if invalid == 'foreign' else
        str(uuid.uuid4()) if invalid == 'missing' else refs['local_choices'][kind])
    if invalid == 'inactive':
        async with async_session_factory() as session:
            await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(is_active=False))
            await session.commit()
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target)
    assert page['items'] == [] and page['total'] == 0
    response = await create_choice(client, refs, kind, target)
    assert response.status_code == 404, response.text
    assert 'FOREIGN-PRIVATE' not in response.text and await snapshot(refs) == before


@pytest.mark.parametrize('kind', ['vehicle', 'appointment', 'case', 'invoice'])
@pytest.mark.parametrize('edge', ['foreign_customer', 'foreign_vehicle_owner'])
async def test_local_choice_with_a_foreign_nested_edge_is_hidden_and_rejected(client, owning_choices, kind, edge):
    refs = owning_choices
    target = refs['local_choices'][kind]
    async with async_session_factory() as session:
        if edge == 'foreign_vehicle_owner':
            await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(
                customer_id=uuid.UUID(refs['foreign_customer'])))
        else:
            await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(
                customer_id=uuid.UUID(refs['foreign_customer'])))
        await session.commit()
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target)
    assert page['total'] == 0 and page['items'] == []
    response = await create_choice(client, refs, kind, target)
    assert response.status_code == 404 and await snapshot(refs) == before


@pytest.mark.parametrize('kind', ['appointment', 'case', 'invoice'])
async def test_local_owning_choice_with_foreign_vehicle_is_hidden(client, owning_choices, kind):
    refs = owning_choices
    target = refs['local_choices'][kind]
    async with async_session_factory() as session:
        await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(
            vehicle_id=uuid.UUID(refs['foreign_vehicle'])))
        await session.commit()
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target)
    assert page['total'] == 0 and page['items'] == []
    response = await create_choice(client, refs, kind, target)
    assert response.status_code == 404 and await snapshot(refs) == before


async def test_case_choice_rejects_foreign_recorded_staff_but_keeps_inactive_local_history(client, owning_choices):
    refs = owning_choices
    target = refs['local_choices']['case']
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == uuid.UUID(refs['ids'][0])).values(is_active=False))
        await session.commit()
    page = await page_for(client, refs, 'case', target)
    assert page['total'] == 1
    assert (await create_choice(client, refs, 'case', target)).status_code == 201
    async with async_session_factory() as session:
        await session.execute(update(OperationalCase).where(OperationalCase.id == uuid.UUID(target)).values(
            assigned_user_id=uuid.UUID(refs['ids'][2])))
        await session.commit()
    before = await snapshot(refs)
    page = await page_for(client, refs, 'case', target)
    assert page['total'] == 0 and page['items'] == []
    assert (await create_choice(client, refs, 'case', target)).status_code == 404
    assert await snapshot(refs) == before


@pytest.mark.parametrize('kind', ['appointment', 'case', 'invoice'])
@pytest.mark.parametrize('historical', ['inactive_nested', 'local_transfer'])
async def test_owning_choices_preserve_valid_local_historical_snapshots(client, owning_choices, kind, historical):
    refs = owning_choices
    target = refs['local_choices'][kind]
    async with async_session_factory() as session:
        if historical == 'inactive_nested':
            for model, key in [(Customer, 'customer'), (Vehicle, 'vehicle')]:
                await session.execute(update(model).where(model.id == uuid.UUID(refs[key])).values(is_active=False))
        else:
            await session.execute(update(Vehicle).where(Vehicle.id == uuid.UUID(refs['vehicle'])).values(
                customer_id=uuid.UUID(refs['other_customer'])))
        await session.commit()
    page = await page_for(client, refs, kind, target)
    assert page['total'] == 1 and page['items'][0]['customer_id'] == refs['customer']
    assert page['items'][0]['vehicle_id'] == refs['vehicle']
    response = await create_choice(client, refs, kind, target)
    assert response.status_code == 201, response.text
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(response.json()['id']))
        assert str(getattr(row, FIELDS[kind])) == target
        assert row.customer_id is None and row.vehicle_id is None


@pytest.mark.parametrize('kind', ['case', 'invoice'])
async def test_owning_choice_with_no_optional_vehicle_still_matches_selected_vehicle(client, owning_choices, kind):
    refs = owning_choices
    target = refs['local_choices'][kind]
    context = {'customer_id': refs['customer'], 'vehicle_id': refs['vehicle']}
    async with async_session_factory() as session:
        await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(vehicle_id=None))
        await session.commit()
    page = await page_for(client, refs, kind, target, **context)
    assert page['total'] == 1 and page['items'][0].get('vehicle_id') is None
    response = await create_choice(client, refs, kind, target, **context)
    assert response.status_code == 201, response.text


@pytest.mark.parametrize('kind', MODELS)
@pytest.mark.parametrize('context_kind', MODELS)
async def test_foreign_selected_context_is_denied_before_any_choice_projection(client, owning_choices, kind, context_kind):
    refs = owning_choices
    before = await snapshot(refs)
    response = await client.get(PATH, headers=refs['admin'], params={
        'kind': kind, FIELDS[context_kind]: refs['foreign_choices'][context_kind]})
    assert response.status_code == 404, response.text
    assert 'FOREIGN-PRIVATE' not in response.text and await snapshot(refs) == before


@pytest.mark.parametrize('kind', MODELS)
async def test_incompatible_selected_customer_and_vehicle_is_explicitly_rejected(client, owning_choices, kind):
    refs = owning_choices
    before = await snapshot(refs)
    response = await client.get(PATH, headers=refs['admin'], params={
        'kind': kind, 'customer_id': refs['other_customer'], 'vehicle_id': refs['vehicle']})
    assert response.status_code == 422, response.text
    assert await snapshot(refs) == before


@pytest.mark.parametrize('kind', ['customer', 'vehicle', 'appointment', 'case', 'invoice'])
async def test_choices_filter_valid_candidates_incompatible_with_the_selected_context(client, owning_choices, kind):
    refs = owning_choices
    target = refs['other_customer'] if kind == 'customer' else refs['local_choices'][kind]
    if kind in ['appointment', 'case', 'invoice', 'vehicle']:
        async with async_session_factory() as session:
            await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(
                customer_id=uuid.UUID(refs['other_customer'])))
            await session.commit()
    context = {'vehicle_id': refs['vehicle']} if kind == 'customer' else {'customer_id': refs['customer']}
    # A changed vehicle now belongs to the other owner, so its direct customer
    # context is independently valid but cannot accept that candidate.
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target, **context)
    assert page['total'] == 0 and page['items'] == []
    response = await create_choice(client, refs, kind, target, **context)
    assert response.status_code == 422, response.text
    assert await snapshot(refs) == before


async def test_all_six_selected_uuid_references_commit_together_and_keep_case_lifecycle(client, owning_choices):
    refs = owning_choices
    selected = {FIELDS[kind]: target for kind, target in refs['local_choices'].items()}
    response = await client.post('/api/v1/conversations', headers=refs['admin'],
        json={'subject': 'Complete selected context', **selected})
    assert response.status_code == 201, response.text
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(response.json()['id']))
        assert row.service_center_id == refs['center'] and row.status == 'open'
        assert all(str(getattr(row, field)) == target for field, target in selected.items())
        assert await session.scalar(select(OperationalCase.status).where(
            OperationalCase.id == uuid.UUID(selected['case_id']))) == 'in_progress'


@pytest.mark.parametrize('kind,context_kind', [('appointment', 'case'), ('case', 'invoice'), ('invoice', 'appointment')])
@pytest.mark.parametrize('coordinate', ['customer', 'vehicle'])
async def test_independent_owning_context_excludes_contradictory_choice_snapshots(client, owning_choices, kind, context_kind, coordinate):
    refs = owning_choices
    target = refs['local_choices'][kind]
    async with async_session_factory() as session:
        if coordinate == 'customer':
            replacement = uuid.UUID(refs['other_customer'])
        else:
            vehicle = Vehicle(service_center_id=refs['center'], customer_id=uuid.UUID(refs['customer']),
                vehicle_model_id=uuid.UUID(refs['model']), year=2020)
            session.add(vehicle)
            await session.flush()
            replacement = vehicle.id
        await session.execute(update(MODELS[kind]).where(MODELS[kind].id == uuid.UUID(target)).values(
            **{coordinate + '_id': replacement}))
        await session.commit()
    context = {FIELDS[context_kind]: refs['local_choices'][context_kind]}
    before = await snapshot(refs)
    page = await page_for(client, refs, kind, target, **context)
    assert page['total'] == 0 and page['items'] == []
    assert (await create_choice(client, refs, kind, target, **context)).status_code == 422
    assert await snapshot(refs) == before


@pytest.mark.parametrize('suspend', ['user', 'center'])
async def test_choice_reads_recheck_current_caller_identity(client, owning_choices, identity, suspend):
    refs = owning_choices
    model, target = (User, identity['user']) if suspend == 'user' else (ServiceCenter, refs['center'])
    async with async_session_factory() as session:
        await session.execute(update(model).where(model.id == target).values(is_active=False))
        await session.commit()
    before = await snapshot(refs)
    response = await client.get(PATH, headers=refs['admin'], params={'kind': 'customer'})
    assert response.status_code == 401, response.text
    assert await snapshot(refs) == before


async def test_choice_reads_recheck_the_current_caller_role(client, owning_choices, identity):
    refs = owning_choices
    async with async_session_factory() as session:
        user = await session.get(User, identity['user'])
        original = user.role_id
        role = await session.get(Role, original)
        originally_active = role.is_active
        await session.execute(update(Role).where(Role.id == original).values(is_active=False))
        await session.commit()
    try:
        before = await snapshot(refs)
        response = await client.get(PATH, headers=refs['admin'], params={'kind': 'customer'})
        assert response.status_code == 401, response.text
        assert await snapshot(refs) == before
    finally:
        async with async_session_factory() as session:
            await session.execute(update(Role).where(Role.id == original).values(is_active=originally_active))
            await session.commit()


@pytest.mark.parametrize('kind', MODELS)
async def test_normal_demo_can_read_choices_but_cannot_create_a_conversation(client, owning_choices, identity, monkeypatch, kind):
    refs = owning_choices
    monkeypatch.setattr(settings, 'DEMO_MODE_ENABLED', True)
    monkeypatch.setattr(settings, 'DEMO_EMAIL', identity['email'])
    login = await client.post('/api/v1/auth/demo')
    assert login.status_code == 200
    private = PrivateWorkshop(headers={'Authorization': 'Bearer ' + login.json()['access_token']})
    before = await snapshot(refs)
    read = await client.get(PATH, headers=private['headers'], params={'kind': kind})
    assert read.status_code == 200, read.text
    assert 'FOREIGN-PRIVATE' not in read.text
    create = await client.post('/api/v1/conversations', headers=private['headers'],
        json={FIELDS[kind]: refs['local_choices'][kind]})
    assert create.status_code == 403, create.text
    assert await snapshot(refs) == before


@pytest.mark.parametrize('kind', MODELS)
async def test_password_customer_identity_cannot_enumerate_staff_choices(client, owning_choices, kind):
    refs = owning_choices
    email = uuid.uuid4().hex + '@example.com'
    account = await client.post(f"/api/v1/customers/{refs['customer']}/account", headers=refs['admin'],
        json={'email': email, 'password': PASSWORD})
    assert account.status_code == 201, account.text
    login = await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})
    assert login.status_code == 200
    private = PrivateWorkshop(headers={'Authorization': 'Bearer ' + login.json()['access_token']})
    before = await snapshot(refs)
    response = await client.get(PATH, headers=private['headers'], params={'kind': kind})
    assert response.status_code == 401, response.text
    assert await snapshot(refs) == before
