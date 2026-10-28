"""Platform control center (tree, workshops, staff access, logs) and the
dealer-network visibility rule customers are held to."""
import uuid

import pytest_asyncio
from sqlalchemy import delete, select

from app.core.database import async_session_factory, engine
from app.models import Customer, Network, ServiceCenter
from tests.support.auth_sessions import persisted_access
from tests.test_platform_api import platform_headers
from tests.test_staff_access_lifecycle import client, identity, _as_role, PASSWORD  # noqa: F401

ADMIN_PASSWORD = 'Workshop-admin-only-2026!'


@pytest_asyncio.fixture
async def world():
    """An exclusive dealer network (2 active + 1 suspended branch), an open network,
    an independent workshop, and customers registered in different ways."""
    tag = uuid.uuid4().hex[:12]
    async with async_session_factory() as session:
        dealer = Network(name=f'Dealer {tag}', slug=f'dealer-{tag}', is_exclusive=True)
        open_net = Network(name=f'Open {tag}', slug=f'open-{tag}', is_exclusive=False)
        session.add_all([dealer, open_net]); await session.flush()
        centers = {
            'dealer_a': ServiceCenter(name=f'Dealer A {tag}', network_id=dealer.id),
            'dealer_b': ServiceCenter(name=f'Dealer B {tag}', network_id=dealer.id),
            'dealer_off': ServiceCenter(name=f'Dealer Off {tag}', network_id=dealer.id, is_active=False),
            'open_a': ServiceCenter(name=f'Open A {tag}', network_id=open_net.id),
            'indie': ServiceCenter(name=f'Indie {tag}'),
        }
        session.add_all(centers.values()); await session.flush()
        customers = {
            'dealer_client': Customer(service_center_id=centers['dealer_a'].id, full_name='Dealer client'),
            'self_client': Customer(service_center_id=centers['dealer_a'].id, full_name='Self client',
                                    registered_via='self'),
            'indie_client': Customer(service_center_id=centers['indie'].id, full_name='Indie client'),
            'open_client': Customer(service_center_id=centers['open_a'].id, full_name='Open client'),
        }
        session.add_all(customers.values()); await session.commit()
        ids = {'tag': tag, 'networks': [dealer.id, open_net.id], 'dealer': dealer.id,
               **{k: c.id for k, c in centers.items()}, **{k: c.id for k, c in customers.items()}}
    try:
        yield ids
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.name.like(f'% {tag}')))
            await session.execute(delete(Network).where(Network.slug.like(f'%{tag}')))
            await session.commit()
        await engine.dispose()


async def _workshops(client, world, customer_key):
    token = await persisted_access({'sub': str(world[customer_key]), 'scid': str(world[_home(customer_key)]),
                                    'type': 'customer_access'})
    response = await client.get('/api/v1/customer/workshops', headers={'Authorization': 'Bearer ' + token})
    assert response.status_code == 200, response.text
    body = response.json()
    return body, {item['id'] for item in body['items']}


def _home(customer_key):
    return {'dealer_client': 'dealer_a', 'self_client': 'dealer_a',
            'indie_client': 'indie', 'open_client': 'open_a'}[customer_key]


async def test_dealer_registered_customer_sees_only_active_network_workshops(client, world):
    body, seen = await _workshops(client, world, 'dealer_client')
    assert seen == {str(world['dealer_a']), str(world['dealer_b'])}
    assert body['restricted_to_network'] is True
    assert {i['is_home'] for i in body['items'] if i['id'] == str(world['dealer_a'])} == {True}


async def test_self_registered_customer_stays_open_even_at_exclusive_dealer(client, world):
    body, seen = await _workshops(client, world, 'self_client')
    assert body['restricted_to_network'] is False
    assert {str(world[k]) for k in ('dealer_a', 'dealer_b', 'open_a', 'indie')} <= seen
    assert str(world['dealer_off']) not in seen


async def test_independent_and_open_network_customers_see_every_workshop(client, world):
    for key in ('indie_client', 'open_client'):
        body, seen = await _workshops(client, world, key)
        assert body['restricted_to_network'] is False
        assert {str(world[k]) for k in ('dealer_a', 'dealer_b', 'open_a', 'indie')} <= seen


async def test_lock_follows_the_network_live(client, world, identity):
    headers = await platform_headers(client, identity)
    opened = await client.patch(f"/api/v1/platform/networks/{world['dealer']}", headers=headers,
                                  json={'is_exclusive': False})
    assert opened.status_code == 200, opened.text
    body, seen = await _workshops(client, world, 'dealer_client')
    assert body['restricted_to_network'] is False and str(world['indie']) in seen


async def test_control_center_requires_platform_operator(client, identity):
    await _as_role(identity, 'admin')
    login = await client.post('/api/v1/auth/login', json={'email': identity['email'], 'password': PASSWORD})
    headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
    assert (await client.get('/api/v1/platform/tree', headers=headers)).status_code == 403
    assert (await client.get('/api/v1/platform/audit', headers=headers)).status_code == 403
    denied = await client.post('/api/v1/platform/networks', headers=headers,
                               json={'name': 'X', 'slug': 'x-' + uuid.uuid4().hex[:8]})
    assert denied.status_code == 403
    assert (await client.get('/api/v1/platform/tree')).status_code == 401


async def test_operator_builds_tree_and_controls_workshop_access(client, identity):
    headers = await platform_headers(client, identity)
    me = await client.get('/api/v1/auth/me', headers=headers)
    assert me.json()['platform_permissions'] == ['platform.read', 'platform.write']
    tag = uuid.uuid4().hex[:12]
    created_centers = []
    try:
        network = await client.post('/api/v1/platform/networks', headers=headers,
                                    json={'name': f'Chevrolet {tag}', 'slug': f'chevy-{tag}', 'is_exclusive': True})
        assert network.status_code == 201, network.text
        network_id = network.json()['id']
        duplicate = await client.post('/api/v1/platform/networks', headers=headers,
                                      json={'name': 'Again', 'slug': f'chevy-{tag}'})
        assert duplicate.status_code == 409

        admin_email = f'admin-{tag}@example.com'
        workshop = await client.post('/api/v1/platform/workshops', headers=headers, json={
            'name': f'Chevrolet Tashkent {tag}', 'network_id': network_id, 'timezone': 'Asia/Tashkent',
            'admin': {'full_name': 'Branch admin', 'email': admin_email, 'password': ADMIN_PASSWORD}})
        assert workshop.status_code == 201, workshop.text
        center_id = workshop.json()['id']
        created_centers.append(center_id)
        assert 'password' not in workshop.text

        tree = (await client.get('/api/v1/platform/tree', headers=headers)).json()
        node = next(n for n in tree['networks'] if n['id'] == network_id)
        assert [w['id'] for w in node['workshops']] == [center_id]
        assert node['workshops'][0]['staff_count'] == 1

        again = await client.post('/api/v1/platform/workshops', headers=headers, json={
            'name': f'Copy {tag}', 'admin': {'full_name': 'X', 'email': admin_email.upper(), 'password': ADMIN_PASSWORD}})
        assert again.status_code == 409
        bad_zone = await client.post('/api/v1/platform/workshops', headers=headers, json={
            'name': f'Zone {tag}', 'timezone': 'Mars/Olympus',
            'admin': {'full_name': 'X', 'email': f'z-{tag}@example.com', 'password': ADMIN_PASSWORD}})
        assert bad_zone.status_code == 422

        branch_login = await client.post('/api/v1/auth/login', json={'email': admin_email, 'password': ADMIN_PASSWORD})
        assert branch_login.status_code == 200, branch_login.text

        moved = await client.patch(f'/api/v1/platform/workshops/{center_id}', headers=headers, json={'network_id': None})
        assert moved.status_code == 200 and moved.json()['network_id'] is None

        archived = await client.patch(f'/api/v1/platform/networks/{network_id}', headers=headers, json={'is_active': False})
        assert archived.status_code == 200 and archived.json()['is_active'] is False
        refused = await client.patch(f'/api/v1/platform/workshops/{center_id}', headers=headers, json={'network_id': network_id})
        assert refused.status_code == 422

        staff = (await client.get(f'/api/v1/platform/workshops/{center_id}/staff', headers=headers)).json()
        assert [(s['email'], s['role'], s['is_active']) for s in staff] == [(admin_email, 'admin', True)]
        suspended = await client.patch(f"/api/v1/platform/staff/{staff[0]['id']}", headers=headers, json={'is_active': False})
        assert suspended.status_code == 200 and suspended.json()['is_active'] is False
        assert (await client.post('/api/v1/auth/login', json={'email': admin_email, 'password': ADMIN_PASSWORD})).status_code == 401
        branch_headers = {'Authorization': 'Bearer ' + branch_login.json()['access_token']}
        assert (await client.get('/api/v1/auth/me', headers=branch_headers)).status_code == 401

        assert (await client.patch(f"/api/v1/platform/staff/{identity['user']}", headers=headers,
                                   json={'is_active': False})).status_code == 403
        assert (await client.patch(f"/api/v1/platform/staff/{staff[0]['id']}", headers=headers,
                                   json={})).status_code == 422

        logs = await client.get(f'/api/v1/platform/audit?center_id={center_id}&action=platform.', headers=headers)
        assert logs.status_code == 200, logs.text
        actions = [item['action'] for item in logs.json()['items']]
        assert {'platform.workshop.create', 'platform.staff.create', 'platform.workshop.update',
                'platform.staff.update'} <= set(actions)
        assert all(item['actor_email'] == identity['email'] for item in logs.json()['items'])
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id.in_(created_centers)))
            await session.execute(delete(Network).where(Network.slug.like(f'%{tag}')))
            await session.commit()


async def test_new_customers_default_to_workshop_registration(world):
    async with async_session_factory() as session:
        source = await session.scalar(select(Customer.registered_via).where(Customer.id == world['dealer_client']))
    assert source == 'workshop'


async def test_review_regressions_archived_rename_network_logs_and_self_lockout(client, identity, world):
    headers = await platform_headers(client, identity)
    dealer, branch = world['dealer'], world['dealer_a']
    assert (await client.patch(f'/api/v1/platform/networks/{dealer}', headers=headers,
                               json={'is_active': False})).status_code == 200
    # Renaming a workshop that still sits in an archived network keeps its network.
    renamed = await client.patch(f'/api/v1/platform/workshops/{branch}', headers=headers,
                                 json={'name': f"Dealer A renamed {world['tag']}", 'network_id': str(dealer)})
    assert renamed.status_code == 200, renamed.text
    # A network's own changes appear when the log is scoped to that network.
    logs = (await client.get(f'/api/v1/platform/audit?network_id={dealer}', headers=headers)).json()
    assert {'platform.network.update', 'platform.workshop.update'} <= {i['action'] for i in logs['items']}
    # Empty PATCH bodies are rejected instead of writing a no-op audit row.
    assert (await client.patch(f'/api/v1/platform/networks/{dealer}', headers=headers, json={})).status_code == 422
    assert (await client.patch(f'/api/v1/platform/workshops/{branch}', headers=headers, json={})).status_code == 422
    # The operator cannot suspend the workshop their own account is anchored to.
    own = await client.patch(f"/api/v1/platform/workshops/{identity['center']}", headers=headers, json={'is_active': False})
    assert own.status_code == 403
    assert (await client.get('/api/v1/platform/tree', headers=headers)).status_code == 200
