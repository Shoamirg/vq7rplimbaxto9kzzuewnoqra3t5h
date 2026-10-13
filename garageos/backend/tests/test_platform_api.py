"""Global platform reads remain distinct from tenant workspace access."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import delete, update

from app.core.database import async_session_factory
from app.core.security import create_access_token
from tests.support.auth_sessions import persisted_access
from app.models import Customer, Invoice, Payment, ServiceCenter, User
from tests.test_staff_access_lifecycle import client, identity, _as_role, PASSWORD


async def test_platform_requires_explicit_role_and_flag(client, identity):
    await _as_role(identity, 'super_admin')
    login = await client.post('/api/v1/auth/login', json={'email': identity['email'], 'password': PASSWORD})
    headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
    assert (await client.get('/api/v1/platform/records/centers', headers=headers)).status_code == 403
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity['user']).values(is_super_admin=True))
        await session.commit()
    records = await client.get('/api/v1/platform/records/centers', headers=headers)
    assert records.status_code == 200, records.text
    assert str(identity['center']) in {row['id'] for row in records.json()['items']}
    profile = await client.get('/api/v1/auth/me', headers=headers)
    assert profile.json()['platform_permissions'] == ['platform.read']
    await _as_role(identity, 'admin')
    assert (await client.get('/api/v1/platform/records/centers', headers=headers)).status_code == 403
    assert (await client.get('/api/v1/auth/me', headers=headers)).json()['platform_permissions'] == []


async def platform_headers(client, identity):
    await _as_role(identity, 'super_admin')
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity['user']).values(is_super_admin=True))
        await session.commit()
    signed = await client.post('/api/v1/auth/login', json={'email': identity['email'], 'password': PASSWORD})
    return {'Authorization': 'Bearer ' + signed.json()['access_token']}


@pytest.mark.parametrize('change', ['demo', 'flag', 'user', 'role', 'center', 'customer_token'])
async def test_platform_privilege_rechecked_on_every_request(client, identity, change):
    headers = await platform_headers(client, identity)
    assert (await client.get('/api/v1/platform/stats', headers=headers)).status_code == 200
    if change in {'demo', 'customer_token'}:
        payload = {'sub': str(identity['user']), 'type': 'access', 'demo': True}
        if change == 'customer_token':
            payload = {'sub': str(identity['user']), 'type': 'customer_access'}
        signed = (await persisted_access(payload)) if change == 'demo' else create_access_token(payload)
        headers = {'Authorization': 'Bearer ' + signed}
    else:
        model, id_ = {'flag': (User, identity['user']), 'user': (User, identity['user']),
                      'role': (User, identity['user']), 'center': (ServiceCenter, identity['center'])}[change]
        if change == 'role':
            await _as_role(identity, 'mechanic')
        else:
            async with async_session_factory() as session:
                values = {'is_super_admin': False} if change == 'flag' else {'is_active': False}
                await session.execute(update(model).where(model.id == id_).values(**values)); await session.commit()
    denied = await client.get('/api/v1/platform/stats', headers=headers)
    assert denied.status_code == (403 if change in {'demo', 'flag', 'role'} else 401)


async def test_platform_uses_safe_global_pages_and_independent_currency_period_totals(client, identity):
    headers = await platform_headers(client, identity)
    marker = 'Platform-' + uuid.uuid4().hex
    foreign = ServiceCenter(name=marker)
    day = datetime(2026, 10, 6, 23, 59, 59, tzinfo=timezone.utc)
    old = datetime(2020, 1, 1, tzinfo=timezone.utc)
    async with async_session_factory() as session:
        session.add(foreign); await session.flush()
        customers = [Customer(service_center_id=foreign.id, full_name=f'{marker}-{i}') for i in range(31)]
        own = Customer(service_center_id=identity['center'], full_name=marker)
        session.add_all([own, *customers]); await session.flush()
        rows = []
        for code, currency, total, status, kind, active, issued in [
            ('UZS', 'UZS', 100000, 'issued', 'invoice', True, day),
            ('USD', 'USD', 10, 'issued', 'invoice', True, day),
            ('DRAFT', 'UZS', 900000, 'draft', 'invoice', True, None),
            ('VOID', 'UZS', 999999, 'void', 'invoice', True, day),
            ('EST', 'UZS', 800000, 'approved', 'estimate', True, day),
            ('OLD', 'UZS', 500, 'paid', 'invoice', True, old),
            ('INACTIVE', 'UZS', 700, 'issued', 'invoice', False, day),
        ]:
            row = Invoice(service_center_id=foreign.id, customer_id=customers[0].id,
                          code=code, currency=currency, total=total, status=status, kind=kind,
                          is_active=active, issued_at=issued, notes='PRIVATE-NOTE')
            session.add(row); rows.append(row)
        await session.flush()
        for index, amount, kind, received in [(0, 40, 'payment', day), (0, 10, 'deposit', day),
                                              (0, 5, 'refund', day), (1, 2, 'payment', day),
                                              (2, 900, 'payment', day), (3, 999, 'payment', day),
                                              (0, 500, 'payment', old), (6, 700, 'payment', day)]:
            session.add(Payment(service_center_id=foreign.id, invoice_id=rows[index].id, amount=amount,
                                kind=kind, method='cash', received_at=received,
                                reference='PRIVATE-REFERENCE', idempotency_key=str(uuid.uuid4())))
        await session.commit()
        foreign_customer_id = str(customers[0].id)
    try:
        url = '/api/v1/platform/records/customers?q=' + marker
        global_page = await client.get(url, headers=headers)
        assert global_page.status_code == 200, global_page.text
        assert global_page.json()['total'] == 32
        selected = url + '&center_id=' + str(foreign.id)
        first = (await client.get(selected, headers=headers)).json()
        second = (await client.get(selected + '&page=2', headers=headers)).json()
        assert first['total'] == 31 and len(first['items']) == 30 and len(second['items']) == 1
        assert not ({r['id'] for r in first['items']} & {r['id'] for r in second['items']})
        assert all(r['service_center_id'] == str(foreign.id) for r in first['items'])
        assert (await client.get('/api/v1/platform/records/customers?q=%25&center_id=' + str(foreign.id), headers=headers)).json()['total'] == 0
        # Platform routes never widen a tenant business endpoint.
        assert (await client.get('/api/v1/customers/' + foreign_customer_id, headers=headers)).status_code == 404
        for kind in ['centers', 'staff', 'vehicles', 'appointments', 'invoices', 'payments']:
            result = await client.get('/api/v1/platform/records/' + kind, headers=headers)
            assert result.status_code == 200, result.text
            assert 'password_hash' not in result.text and 'PRIVATE-' not in result.text and 'idempotency' not in result.text
        period = '?center_id=' + str(foreign.id) + '&start=2026-10-01&end=2026-10-06'
        stats = await client.get('/api/v1/platform/stats' + period, headers=headers)
        assert stats.status_code == 200, stats.text
        money = {item['currency']: item for item in stats.json()['money']}
        assert Decimal(money['UZS']['invoiced']) == 100000
        assert Decimal(money['UZS']['received']) == 50
        assert Decimal(money['UZS']['refunds']) == 5
        assert Decimal(money['UZS']['net_received']) == 45
        assert Decimal(money['USD']['invoiced']) == 10 and Decimal(money['USD']['received']) == 2
        assert (await client.get('/api/v1/platform/stats?start=2026-10-10&end=2026-10-01', headers=headers)).status_code == 422
        assert (await client.get('/api/v1/platform/records/centers?page=0', headers=headers)).status_code == 422
        assert (await client.post('/api/v1/platform/records/centers', headers=headers, json={})).status_code == 405
        await _as_role(identity, 'admin')
        assert (await client.get('/api/v1/platform/records/customers', headers=headers)).status_code == 403
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == foreign.id)); await session.commit()
