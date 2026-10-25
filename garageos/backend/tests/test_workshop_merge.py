"""Regression coverage for the old workshop branch on the current staff API."""
import uuid
from types import SimpleNamespace

import httpx
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import async_session_factory
from app.models import Appointment, Customer, MaintenanceRule, User, VehicleModel
from tests.test_mechanic_work_api import create_job, workshop
from tests.test_staff_access_lifecycle import client, identity
from tests.support.auth_sessions import persisted_access


async def test_workshop_keeps_assignment_and_completion_reward_atomic(client, workshop):
    job = await create_job(client, workshop)
    admin, mechanic = workshop['admin'], workshop['mechanics'][0]
    await client.patch(f'/api/v1/appointments/{job}/assign-mechanic', headers=admin,
                       json={'mechanic_user_id': workshop['ids'][0]})
    mine = await client.get('/api/v1/workshop/jobs', headers=mechanic)
    assert mine.status_code == 200, mine.text
    assert [row['id'] for row in mine.json()['upcoming']] == [job]
    assert (await client.get(f'/api/v1/workshop/jobs/{job}', headers=workshop['mechanics'][1])).status_code == 404
    assert (await client.post(f'/api/v1/workshop/jobs/{job}/start', headers=mechanic)).status_code == 409
    await client.patch(f'/api/v1/appointments/{job}/confirm', headers=admin)
    assert (await client.post(f'/api/v1/workshop/jobs/{job}/start', headers=mechanic)).status_code == 200
    async with async_session_factory() as session:
        row = await session.get(Appointment, uuid.UUID(job))
        customer_id = row.customer_id
        await session.execute(update(Appointment).where(Appointment.id == row.id).values(total_cost=1000))
        before = await session.scalar(select(Customer.loyalty_points).where(Customer.id == customer_id))
        await session.commit()
    detail = await client.get(f'/api/v1/workshop/jobs/{job}', headers=mechanic)
    assert 'total_cost' not in detail.json()
    result = await client.post(f'/api/v1/workshop/jobs/{job}/finish', headers=mechanic, json={})
    assert result.status_code == 200, result.text
    assert (await client.post(f'/api/v1/workshop/jobs/{job}/finish', headers=mechanic, json={})).status_code == 409
    async with async_session_factory() as session:
        balance = await session.scalar(select(Customer.loyalty_points).where(Customer.id == customer_id))
        assert balance == (before or 0) + 100


async def test_owner_manages_services_without_crossing_garages(client, workshop, identity):
    async with async_session_factory() as session:
        model = await session.get(VehicleModel, uuid.UUID(workshop['model']))
        foreign = await session.get(User, uuid.UUID(workshop['ids'][2]))
        available, unavailable = f'Local-{uuid.uuid4().hex}', f'Foreign-{uuid.uuid4().hex}'
        session.add_all([
            MaintenanceRule(brand_id=model.brand_id, service_center_id=identity['center'], service_type=available),
            MaintenanceRule(brand_id=model.brand_id, service_center_id=foreign.service_center_id, service_type=unavailable),
        ])
        await session.commit()
    admin, uid = workshop['admin'], workshop['ids'][0]
    catalog = await client.get('/api/v1/staff/services', headers=admin)
    assert available in catalog.json() and unavailable not in catalog.json()
    saved = await client.put(f'/api/v1/staff/mechanics/{uid}/services', headers=admin,
                             json={'service_types': [available, available]})
    assert saved.status_code == 200, saved.text
    assert saved.json()['service_types'] == [available]
    assert (await client.put(f'/api/v1/staff/mechanics/{uid}/services', headers=admin,
                             json={'service_types': [unavailable]})).status_code == 422
    assert (await client.delete(f"/api/v1/staff/mechanics/{workshop['ids'][2]}", headers=admin)).status_code == 404
    created = await client.post('/api/v1/staff/mechanics', headers=admin, json={'name': 'New master'})
    assert created.status_code == 201, created.text
    assert 'password' not in created.json()
    retired = await client.delete(f'/api/v1/staff/mechanics/{uid}', headers=admin)
    assert retired.status_code == 200, retired.text
    assert (await client.get('/api/v1/auth/me', headers=workshop['mechanics'][0])).status_code == 401


async def test_demo_and_mechanic_cannot_manage_workshop_team(client, workshop, identity):
    demo = await persisted_access({'sub': str(identity['user']), 'type': 'access', 'demo': True})
    for headers in [workshop['mechanics'][0], {'Authorization': f'Bearer {demo}'}]:
        assert (await client.get('/api/v1/staff/mechanics', headers=headers)).status_code == 403
        assert (await client.post('/api/v1/staff/mechanics', headers=headers, json={'name': 'Blocked'})).status_code == 403


async def test_telegram_ingest_and_media_keep_tenant_boundary(client, workshop, identity, monkeypatch):
    from app.api.v1.endpoints import telegram_gateway as gateway

    job = await create_job(client, workshop)
    telegram_id = uuid.uuid4().int % 10**14
    async with async_session_factory() as session:
        row = await session.get(Appointment, uuid.UUID(job))
        await session.execute(update(Customer).where(Customer.id == row.customer_id).values(telegram_id=telegram_id))
        owner = await session.get(User, identity['user'])
        await session.execute(update(User).where(User.id == uuid.UUID(workshop['ids'][2])).values(role_id=owner.role_id))
        await session.commit()
    monkeypatch.setattr(settings, 'TELEGRAM_WEBHOOK_SECRET', 'merge-bot-secret')
    monkeypatch.setattr(settings, 'TELEGRAM_BOT_TOKEN', 'merge-test-bot')
    payload = {'telegram_id': telegram_id, 'text': 'Telegram photo',
               'attachments': [{'kind': 'photo', 'file_id': 'merge_test_file'}]}
    assert (await client.post('/api/v1/telegram/ingest', json=payload)).status_code == 403
    posted = await client.post('/api/v1/telegram/ingest', json=payload, headers={'X-Bot-Secret': 'merge-bot-secret'})
    assert posted.status_code == 200, posted.text
    thread = await client.get(f"/api/v1/conversations/{posted.json()['conversation_id']}", headers=workshop['admin'])
    assert any(message['body'] == 'Telegram photo' for message in thread.json()['messages'])

    def telegram(request):
        if request.url.path.endswith('/getFile'):
            return httpx.Response(200, json={'ok': True, 'result': {'file_path': 'photos/test.png'}})
        return httpx.Response(200, content=b'photo-bytes', headers={'content-type': 'image/png'})

    monkeypatch.setattr(gateway, 'httpx', SimpleNamespace(AsyncClient=lambda **kwargs:
                        httpx.AsyncClient(transport=httpx.MockTransport(telegram), **kwargs)))
    media = await client.get('/api/v1/telegram/media/merge_test_file', headers=workshop['admin'])
    assert media.status_code == 200 and media.content == b'photo-bytes', media.text
    assert 'no-store' in media.headers['cache-control']
    assert (await client.get('/api/v1/telegram/media/merge_test_file', headers=workshop['mechanics'][2])).status_code == 404
    assert (await client.get('/api/v1/telegram/media/missing', headers=workshop['admin'])).status_code == 404
