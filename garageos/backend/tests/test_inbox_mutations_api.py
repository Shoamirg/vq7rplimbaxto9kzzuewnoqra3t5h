"""Desired Inbox mutations through real password auth, FK and UnitOfWork.

Authentication and application responses are never replaced with test doubles.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select, update

from app.core.database import async_session_factory
from app.core.events import CaseResolved, ConversationStarted, event_bus
from app.models import Appointment, Customer, Role, User, Vehicle
from app.models.conversation import Conversation, Participant
from app.models.invoice import Invoice
from app.models.operational_case import OperationalCase
from app.repositories.unit_of_work import UnitOfWork
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, snapshot  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401
from tests.test_transaction_response_api import Operation, send_observed


async def create(client, refs, **changes):
    response = await client.post('/api/v1/conversations', headers=refs['admin'], json={
        'subject': 'Recorded communication', 'customer_id': refs['customer'], **changes,
    })
    assert response.status_code == 201, response.text
    return response.json()['id']


@pytest.mark.parametrize('field,value', [
    ('conv_type', 'invalid'), ('priority', 'invalid'), ('subject', 'x'*201),
    ('participants', [{'role': 'invalid', 'display_name': 'Stored name'}]),
    ('participants', [{'role': 'watcher', 'display_name': 'x'*121}]),
])
async def test_create_shape_validation_has_no_effect(client, references, monkeypatch, field, value):
    before, events = await snapshot(references), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.post('/api/v1/conversations', headers=references['admin'], json={field: value})
    assert response.status_code == 422
    assert await snapshot(references) == before and not events


@pytest.mark.parametrize('target', ['foreign_customer', 'missing_customer', 'inactive_customer',
    'foreign_vehicle', 'missing_vehicle', 'inactive_vehicle', 'wrong_owner',
    'foreign_assignee', 'missing_assignee', 'inactive_assignee', 'inactive_role',
    'foreign_participant', 'missing_participant'])
async def test_create_rejects_invalid_new_references_atomically(client, references, monkeypatch, target):
    refs = references
    body = {'subject': 'Rejected', 'customer_id': refs['customer'], 'vehicle_id': refs['vehicle']}
    expected = 404
    if target.startswith(('foreign_customer', 'foreign_vehicle')):
        body[target.removeprefix('foreign_')+'_id'] = refs[target]
    elif target.startswith(('missing_customer', 'missing_vehicle')):
        body[target.removeprefix('missing_')+'_id'] = str(uuid.uuid4())
    elif target.startswith(('inactive_customer', 'inactive_vehicle')):
        model, key = (Customer, 'customer') if target.endswith('customer') else (Vehicle, 'vehicle')
        async with async_session_factory() as session:
            await session.execute(update(model).where(model.id == uuid.UUID(refs[key])).values(is_active=False))
            await session.commit()
    elif target == 'wrong_owner':
        body['customer_id'], expected = refs['other_customer'], 422
    elif target.endswith('assignee') or target == 'inactive_role':
        body['assigned_user_id'] = refs['ids'][2] if target == 'foreign_assignee' else str(uuid.uuid4()) if target == 'missing_assignee' else refs['ids'][0]
        if target in ('inactive_assignee', 'inactive_role'):
            model, key = (User, uuid.UUID(refs['ids'][0])) if target == 'inactive_assignee' else (Role, refs['role'])
            async with async_session_factory() as session:
                await session.execute(update(model).where(model.id == key).values(is_active=False))
                await session.commit()
    else:
        body['participants'] = [{'role': 'watcher', 'display_name': 'Captured name',
            'user_id': refs['ids'][2] if target == 'foreign_participant' else str(uuid.uuid4())}]
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.post('/api/v1/conversations', headers=refs['admin'], json=body)
    assert response.status_code == expected
    assert 'FOREIGN-PRIVATE' not in response.text
    assert await snapshot(refs) == before and not events


async def test_clear_assignment_is_an_explicit_atomic_change(client, references, identity):
    refs = references
    target = await create(client, refs, assigned_user_id=str(identity['user']))
    response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
        json={'assigned_user_id': None, 'status': 'waiting_customer'})
    assert response.status_code == 200
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.assigned_user_id is None and row.status == 'waiting_customer'
        assert row.unread_activity == 1


@pytest.mark.parametrize('patch', [{'status': 'invalid'}, {'status': None},
    {'assigned_user_id': 'foreign', 'status': 'resolved'}])
async def test_combined_patch_validates_before_effect(client, references, monkeypatch, patch):
    refs = references
    target = await create(client, refs)
    if patch.get('assigned_user_id') == 'foreign':
        patch = {**patch, 'assigned_user_id': refs['ids'][2]}
    events = []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'], json=patch)
    assert response.status_code == (404 if 'assigned_user_id' in patch else 422)
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.status == 'open' and row.assigned_user_id is None and row.unread_activity == 0
    assert not events


async def test_duplicate_set_status_does_not_create_unread_activity(client, references):
    refs = references
    target = await create(client, refs)
    for _ in range(2):
        response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'], json={'status': 'open'})
        assert response.status_code == 200
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.status == 'open' and row.unread_activity == 0


@pytest.mark.parametrize('parallel', [2, 8])
async def test_follow_set_is_serialized_and_owned_by_uuid(client, references, identity, parallel):
    refs = references
    target = await create(client, refs)
    path = f'/api/v1/conversations/{target}/follow'
    responses = await asyncio.gather(*[client.post(path, headers=refs['admin']) for _ in range(parallel)])
    assert [response.status_code for response in responses] == [200]*parallel
    async with async_session_factory() as session:
        parts = list(await session.scalars(select(Participant).where(Participant.conversation_id == uuid.UUID(target),
            Participant.user_id == identity['user'], Participant.service_center_id == refs['center'])))
        assert len(parts) == 1 and parts[0].is_following and parts[0].role == 'watcher'
    for _ in range(2):
        response = await client.delete(path, headers=refs['admin'])
        assert response.status_code == 200
    thread = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
    assert thread.status_code == 200 and not thread.json()['is_following'] and thread.json()['followers'] == 0


async def test_historical_participant_is_distinct_from_subscription(client, references, identity):
    refs = references
    target = await create(client, refs, participants=[{'role': 'manager', 'display_name': 'Captured manager',
        'user_id': str(identity['user'])}])
    path = f'/api/v1/conversations/{target}'
    response = await client.get(path, headers=refs['admin'])
    assert response.status_code == 200 and response.json()['is_following'] is False
    assert (await client.post(path+'/follow', headers=refs['admin'])).status_code == 200
    assert (await client.delete(path+'/follow', headers=refs['admin'])).status_code == 200
    response = await client.get(path, headers=refs['admin'])
    assert not response.json()['is_following'] and response.json()['participants'][0]['role'] == 'manager'


async def test_creation_is_committed_before_first_success_send(client, references):
    refs = references
    subject = 'Durable Inbox '+uuid.uuid4().hex
    async def read():
        async with async_session_factory() as session:
            return tuple(await session.scalars(select(Conversation.id).where(
                Conversation.service_center_id == refs['center'], Conversation.subject == subject)))
    operation = Operation('inbox-create', 'POST', '/api/v1/conversations', refs['admin'],
        {'subject': subject, 'customer_id': refs['customer']}, read)
    observations, statuses = [], []
    response = await send_observed(operation, observations, statuses)
    assert response.status_code == 201 and statuses == [201]
    assert observations == [(uuid.UUID(response.json()['id']),)]


@pytest.mark.parametrize('reference', ['appointment', 'case', 'invoice'])
@pytest.mark.parametrize('invalid', ['foreign', 'missing', 'inactive', 'customer_mismatch', 'foreign_child'])
async def test_new_owning_links_are_eligible_consistent_and_atomic(client, references, monkeypatch, reference, invalid):
    refs = references
    body = {'customer_id': refs['customer'], 'vehicle_id': refs['vehicle']}
    models = {'appointment': Appointment, 'case': OperationalCase, 'invoice': Invoice}
    model = models[reference]
    if invalid == 'missing':
        linked_id = uuid.uuid4()
    else:
        fields = dict(service_center_id=refs['foreign_center'] if invalid == 'foreign' else refs['center'],
            customer_id=uuid.UUID(refs['foreign_customer'] if invalid == 'foreign_child' else
                refs['other_customer'] if invalid == 'customer_mismatch' else refs['customer']),
            vehicle_id=uuid.UUID(refs['vehicle']), is_active=invalid != 'inactive')
        if reference == 'appointment':
            fields.update(appointment_date=datetime(2030, 5, 1, tzinfo=timezone.utc), appointment_time='10:00')
        else:
            fields['code'] = uuid.uuid4().hex[:20]
        if reference == 'case':
            fields['title'] = 'Recorded linked case'
        async with async_session_factory() as session:
            linked = model(**fields)
            session.add(linked)
            await session.commit()
            linked_id = linked.id
    body[reference+'_id'] = str(linked_id)
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.post('/api/v1/conversations', headers=refs['admin'], json=body)
    assert response.status_code == (422 if invalid == 'customer_mismatch' else 404), response.text
    assert await snapshot(refs) == before and not events


async def test_same_named_assignees_remain_distinct_and_duplicate_set_is_noop(client, references):
    refs = references
    target = await create(client, refs)
    for expected_activity, user_id in [(1, refs['ids'][0]), (2, refs['ids'][1]), (2, refs['ids'][1])]:
        response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
            json={'assigned_user_id': user_id})
        assert response.status_code == 200, response.text
        assert response.json()['assigned_user_id'] == user_id
        async with async_session_factory() as session:
            row = await session.get(Conversation, uuid.UUID(target))
            assert str(row.assigned_user_id) == user_id and row.unread_activity == expected_activity


async def test_subscription_set_preserves_duplicate_legacy_participant_snapshots(client, references, identity):
    refs = references
    target = await create(client, refs)
    async with async_session_factory() as session:
        participants = [Participant(service_center_id=refs['center'], conversation_id=uuid.UUID(target),
            user_id=identity['user'], role=role, display_name=name, is_following=True)
            for role, name in [('manager', 'Earlier name'), ('watcher', 'Later name')]]
        session.add_all(participants)
        await session.commit()
        ids = {row.id for row in participants}
    path = f'/api/v1/conversations/{target}'
    thread = await client.get(path, headers=refs['admin'])
    assert thread.status_code == 200 and thread.json()['followers'] == 1
    assert (await client.delete(path+'/follow', headers=refs['admin'])).status_code == 200
    assert (await client.post(path+'/follow', headers=refs['admin'])).status_code == 200
    async with async_session_factory() as session:
        rows = list(await session.scalars(select(Participant).where(Participant.conversation_id == uuid.UUID(target))))
        assert {row.id for row in rows} == ids
        assert {(row.role, row.display_name) for row in rows} == {('manager', 'Earlier name'), ('watcher', 'Later name')}
    thread = await client.get(path, headers=refs['admin'])
    assert thread.json()['is_following'] and thread.json()['followers'] == 1


async def test_conversation_and_case_status_have_separate_lifecycles(client, references, monkeypatch):
    refs = references
    case_response = await client.post('/api/v1/cases', headers=refs['admin'], json={
        'customer_id': refs['customer'], 'vehicle_id': refs['vehicle'], 'title': 'Service work'})
    assert case_response.status_code == 201
    case_id = case_response.json()['id']
    thread = await client.get(f'/api/v1/cases/{case_id}/conversation', headers=refs['admin'])
    assert thread.status_code == 200
    target = thread.json()['id']
    events = []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    for status in ['resolved', 'open', 'snoozed', 'waiting_customer']:
        response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'], json={'status': status})
        assert response.status_code == 200
        async with async_session_factory() as session:
            case = await session.get(OperationalCase, uuid.UUID(case_id))
            conv = await session.get(Conversation, uuid.UUID(target))
            assert case.status == 'new' and conv.status == status
    assert not any(isinstance(event, CaseResolved) for event in events)
    response = await client.patch(f'/api/v1/cases/{case_id}', headers=refs['admin'], json={'status': 'resolved'})
    assert response.status_code == 200
    async with async_session_factory() as session:
        case = await session.get(OperationalCase, uuid.UUID(case_id))
        conv = await session.get(Conversation, uuid.UUID(target))
        assert case.status == 'resolved' and conv.status == 'waiting_customer'
    assert len([event for event in events if isinstance(event, CaseResolved)]) == 1
    assert not any(isinstance(event, ConversationStarted) for event in events)


@pytest.mark.parametrize('operation', ['create', 'update', 'follow'])
async def test_failed_mutation_commit_has_no_success_or_partial_effect(client, references, monkeypatch, operation):
    refs = references
    target = await create(client, refs)
    before, events = await snapshot(refs), []
    async with async_session_factory() as session:
        fields_before = (await session.execute(select(Conversation.status, Conversation.assigned_user_id,
            Conversation.unread_activity).where(Conversation.id == uuid.UUID(target)))).one()

    async def failed_commit(uow):
        raise RuntimeError('Controlled Inbox mutation precommit failure')

    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, 'commit', failed_commit)
        patch.setattr(event_bus, 'dispatch', events.append)
        if operation == 'create':
            response = await client.post('/api/v1/conversations', headers=refs['admin'],
                json={'subject': 'Rolled back', 'customer_id': refs['customer'],
                    'participants': [{'role': 'customer', 'customer_id': refs['customer'], 'display_name': 'Captured'}]})
        elif operation == 'update':
            response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
                json={'status': 'resolved', 'assigned_user_id': refs['ids'][0]})
        else:
            response = await client.post(f'/api/v1/conversations/{target}/follow', headers=refs['admin'])
    assert response.status_code == 500
    assert await snapshot(refs) == before and not events
    async with async_session_factory() as session:
        assert (await session.execute(select(Conversation.status, Conversation.assigned_user_id,
            Conversation.unread_activity).where(Conversation.id == uuid.UUID(target)))).one() == fields_before
