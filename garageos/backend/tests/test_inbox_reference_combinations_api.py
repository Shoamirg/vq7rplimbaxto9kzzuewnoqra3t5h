"""Independent owning records remain consistent when optional context is absent."""
import asyncio
import uuid

import pytest
from sqlalchemy import select, text, update

from app.core.database import async_session_factory
from app.core.events import event_bus
from app.models import Role, User, Vehicle
from app.models.conversation import Conversation
from app.models.invoice import Invoice
from app.models.operational_case import OperationalCase
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references, snapshot  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401
from tests.test_inbox_mutations_api import create


async def inconsistent_owning_records(refs, coordinate):
    async with async_session_factory() as session:
        second_vehicle = None
        if coordinate == 'vehicle':
            original = await session.get(Vehicle, uuid.UUID(refs['vehicle']))
            other = Vehicle(service_center_id=refs['center'], customer_id=original.customer_id,
                vehicle_model_id=original.vehicle_model_id, year=2025)
            session.add(other)
            await session.flush()
            second_vehicle = other.id
        case = OperationalCase(service_center_id=refs['center'], code=uuid.uuid4().hex[:20],
            title='Recorded service work', customer_id=uuid.UUID(refs['customer']),
            vehicle_id=uuid.UUID(refs['vehicle']) if coordinate == 'vehicle' else None)
        invoice = Invoice(service_center_id=refs['center'], code=uuid.uuid4().hex[:20],
            customer_id=uuid.UUID(refs['other_customer'] if coordinate == 'customer' else refs['customer']),
            vehicle_id=second_vehicle)
        session.add_all([case, invoice])
        await session.commit()
        return case.id, invoice.id


@pytest.mark.parametrize('coordinate', ['customer', 'vehicle'])
async def test_omitted_context_cannot_join_inconsistent_owning_records(client, references, monkeypatch, coordinate):
    refs = references
    case_id, invoice_id = await inconsistent_owning_records(refs, coordinate)
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.post('/api/v1/conversations', headers=refs['admin'],
        json={'case_id': str(case_id), 'invoice_id': str(invoice_id)})
    assert response.status_code == 422, response.text
    assert await snapshot(refs) == before and not events


async def test_linked_case_uses_real_operations_deep_link(client, references):
    refs = references
    async with async_session_factory() as session:
        case = OperationalCase(service_center_id=refs['center'], code=uuid.uuid4().hex[:20],
            title='Recorded service work', customer_id=uuid.UUID(refs['customer']))
        session.add(case)
        await session.flush()
        conversation = Conversation(service_center_id=refs['center'], case_id=case.id)
        session.add(conversation)
        await session.commit()
        case_id, conversation_id, case_code = str(case.id), str(conversation.id), case.code

    response = await client.get(f'/api/v1/conversations/{conversation_id}', headers=refs['admin'])

    assert response.status_code == 200, response.text
    linked_case = next(card for card in response.json()['linked'] if card['kind'] == 'case')
    assert linked_case['link'] == f'/operations?case={case_id}'
    assert linked_case['title'] == case_code
    assert linked_case['case_type'] == 'emergency'
    assert linked_case['subtitle'] == 'new'


async def test_linked_appointment_and_invoice_cards_open_owned_records(client, references):
    refs = references
    async with async_session_factory() as session:
        invoice = Invoice(service_center_id=refs['center'], code='INB-' + uuid.uuid4().hex[:16].upper(),
            customer_id=uuid.UUID(refs['customer']), vehicle_id=uuid.UUID(refs['vehicle']),
            appointment_id=uuid.UUID(refs['appointment']), kind='invoice', status='issued')
        session.add(invoice)
        await session.flush()
        conversation = Conversation(service_center_id=refs['center'], customer_id=uuid.UUID(refs['customer']),
            vehicle_id=uuid.UUID(refs['vehicle']), appointment_id=uuid.UUID(refs['appointment']), invoice_id=invoice.id)
        session.add(conversation)
        await session.flush()
        conversation_id = str(conversation.id)
        await session.commit()
        appointment_id, invoice_id, invoice_code = refs['appointment'], str(invoice.id), invoice.code

    response = await client.get(f'/api/v1/conversations/{conversation_id}', headers=refs['admin'])

    assert response.status_code == 200, response.text
    cards = response.json()['linked']
    appointment = next(card for card in cards if card['kind'] == 'appointment')
    invoice = next(card for card in cards if card['kind'] == 'invoice')
    assert appointment['link'] == f'/appointments/{appointment_id}'
    assert appointment['subtitle'] in {'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'}
    assert invoice['link'] == f'/invoice/{invoice_id}'
    assert invoice['title'] == invoice_code and invoice['invoice_kind'] == 'invoice'
    assert invoice['subtitle'] == 'issued'
    assert (await client.get(f'/api/v1/appointments/{appointment_id}', headers=refs['admin'])).status_code == 200


async def test_inactive_historical_vehicle_does_not_claim_health_or_offer_passport(client, references):
    refs = references
    async with async_session_factory() as session:
        vehicle = await session.get(Vehicle, uuid.UUID(refs['vehicle']))
        vehicle.is_active = False
        conversation = Conversation(service_center_id=refs['center'], vehicle_id=vehicle.id)
        session.add(conversation)
        await session.commit()
        conversation_id = str(conversation.id)

    response = await client.get(f'/api/v1/conversations/{conversation_id}', headers=refs['admin'])

    assert response.status_code == 200, response.text
    linked = response.json()['linked']
    assert not any(card['kind'] == 'passport' for card in linked)
    unavailable = next(card for card in linked if card['kind'] == 'vehicle')
    assert unavailable == {'kind': 'vehicle', 'title': None, 'subtitle': None,
        'link': None, 'available': False}


@pytest.mark.parametrize('coordinate', ['customer', 'vehicle'])
@pytest.mark.parametrize('entry', ['list', 'thread'])
async def test_historical_inconsistent_owning_records_are_denied(client, references, monkeypatch, coordinate, entry):
    refs = references
    case_id, invoice_id = await inconsistent_owning_records(refs, coordinate)
    async with async_session_factory() as session:
        conv = Conversation(service_center_id=refs['center'], case_id=case_id, invoice_id=invoice_id)
        session.add(conv)
        await session.commit()
        target = str(conv.id)
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    if entry == 'thread':
        response = await client.get(f'/api/v1/conversations/{target}', headers=refs['admin'])
        assert response.status_code == 404, response.text
    else:
        response = await client.get('/api/v1/conversations', headers=refs['admin'], params={'view': 'all', 'q': target})
        assert response.status_code == 200 and response.json()['total'] == 0
        assert all(value == 0 for value in response.json()['counts'].values())
    assert await snapshot(refs) == before and not events


async def linked_foreign_vehicle_owner(refs):
    async with async_session_factory() as session:
        original = await session.get(Vehicle, uuid.UUID(refs['vehicle']))
        vehicle = Vehicle(service_center_id=refs['center'], customer_id=uuid.UUID(refs['foreign_customer']),
            vehicle_model_id=original.vehicle_model_id, year=2025)
        session.add(vehicle)
        await session.flush()
        case = OperationalCase(service_center_id=refs['center'], code=uuid.uuid4().hex[:20],
            title='Compromised owning reference', customer_id=uuid.UUID(refs['customer']), vehicle_id=vehicle.id)
        session.add(case)
        await session.commit()
        return case.id


async def test_new_owning_link_rejects_its_foreign_vehicle_owner(client, references, monkeypatch):
    refs = references
    case_id = await linked_foreign_vehicle_owner(refs)
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    response = await client.post('/api/v1/conversations', headers=refs['admin'], json={'case_id': str(case_id)})
    assert response.status_code == 404, response.text
    assert await snapshot(refs) == before and not events


@pytest.mark.parametrize('entry', ['list', 'thread', 'update', 'follow'])
async def test_historical_owning_link_foreign_vehicle_owner_is_denied(client, references, monkeypatch, entry):
    refs = references
    case_id = await linked_foreign_vehicle_owner(refs)
    async with async_session_factory() as session:
        conv = Conversation(service_center_id=refs['center'], subject='Denied owning record', case_id=case_id)
        session.add(conv)
        await session.commit()
        target = str(conv.id)
    before, events = await snapshot(refs), []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    path = f'/api/v1/conversations/{target}'
    if entry == 'list':
        response = await client.get('/api/v1/conversations', headers=refs['admin'], params={'view': 'all', 'q': target})
        assert response.status_code == 200 and response.json()['total'] == 0
        assert all(value == 0 for value in response.json()['counts'].values())
    else:
        response = await (client.get(path, headers=refs['admin']) if entry == 'thread' else
            client.patch(path, headers=refs['admin'], json={'status': 'resolved'}) if entry == 'update' else
            client.post(path+'/follow', headers=refs['admin']))
        assert response.status_code == 404, response.text
    assert await snapshot(refs) == before and not events
    async with async_session_factory() as session:
        assert await session.scalar(select(Conversation.status).where(Conversation.id == uuid.UUID(target))) == 'open'


@pytest.mark.parametrize('suspend', ['user', 'role'])
async def test_assignment_waits_for_owned_suspension_then_rechecks_eligibility(client, references, suspend):
    refs = references
    target = await create(client, refs)
    model, record_id = (User, uuid.UUID(refs['ids'][0])) if suspend == 'user' else (Role, refs['role'])
    task = None
    waited = False
    async with async_session_factory() as owner:
        await owner.execute(update(model).where(model.id == record_id).values(is_active=False))
        blocker = await owner.scalar(text('SELECT pg_backend_pid()'))
        try:
            task = asyncio.create_task(client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
                json={'assigned_user_id': refs['ids'][0], 'status': 'resolved'}))
            async with asyncio.timeout(10):
                while not task.done():
                    async with async_session_factory() as observer:
                        waited = await observer.scalar(text('''SELECT EXISTS (
                            SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
                                AND :blocker = ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
                        )'''), {'blocker': blocker})
                    if waited:
                        break
                    await asyncio.sleep(.02)
        finally:
            # Release exactly our suspension transaction before draining the
            # application request, including on a failed observation timeout.
            await owner.commit()
            if task is not None:
                try:
                    response = await asyncio.wait_for(task, timeout=15)
                finally:
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
    assert waited, 'Assignment did not serialize with the owned suspension'
    assert response.status_code == 404, response.text
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.assigned_user_id is None and row.status == 'open' and row.unread_activity == 0


@pytest.mark.parametrize('reference', ['case', 'invoice'])
@pytest.mark.parametrize('source', ['new', 'legacy'])
async def test_missing_optional_owning_vehicle_remains_usable(client, references, reference, source):
    refs = references
    model = {'case': OperationalCase, 'invoice': Invoice}[reference]
    fields = dict(service_center_id=refs['center'], customer_id=uuid.UUID(refs['customer']), vehicle_id=None)
    fields['code'] = uuid.uuid4().hex[:20]
    if reference == 'case':
        fields['title'] = 'Recorded service work without a vehicle snapshot'
    async with async_session_factory() as session:
        linked = model(**fields)
        session.add(linked)
        await session.commit()
        linked_id = str(linked.id)
    if source == 'new':
        target = await create(client, refs, vehicle_id=refs['vehicle'], **{reference+'_id': linked_id})
    else:
        async with async_session_factory() as session:
            conv = Conversation(service_center_id=refs['center'], customer_id=uuid.UUID(refs['customer']),
                vehicle_id=uuid.UUID(refs['vehicle']), **{reference+'_id': uuid.UUID(linked_id)})
            session.add(conv)
            await session.commit()
            target = str(conv.id)
    path = f'/api/v1/conversations/{target}'
    thread = await client.get(path, headers=refs['admin'])
    assert thread.status_code == 200, thread.text
    page = await client.get('/api/v1/conversations', headers=refs['admin'], params={'view': 'all', 'q': target})
    assert page.status_code == 200 and page.json()['total'] == 1
    assert page.json()['items'][0]['id'] == target
    assert (await client.patch(path, headers=refs['admin'], json={'status': 'waiting_customer'})).status_code == 200
    assert (await client.post(path+'/follow', headers=refs['admin'])).status_code == 200
    posted = await client.post(path+'/messages', headers={**refs['admin'], 'Idempotency-Key': str(uuid.uuid4())},
        json={'body': 'Recorded reply on a thread with an absent optional vehicle snapshot'})
    assert posted.status_code == 201, posted.text
    thread = await client.get(path, headers=refs['admin'])
    assert thread.status_code == 200 and thread.json()['messages'][-1]['id'] == posted.json()['id']
