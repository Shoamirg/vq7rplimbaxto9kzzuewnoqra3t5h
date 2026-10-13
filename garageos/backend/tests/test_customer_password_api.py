import uuid
import pytest
from sqlalchemy import update
from app.core.database import async_session_factory
from app.core.security import create_access_token
from tests.support.auth_sessions import persisted_access
from app.models import Customer, ServiceCenter, Invoice
from tests.test_staff_access_lifecycle import _as_role

from tests.test_staff_management_api import owner, login
from tests.test_staff_access_lifecycle import client, identity, PASSWORD


async def test_owner_opens_customer_login_and_suspends_existing_session(client, identity, owner):
    created = await client.post('/api/v1/customers', headers=owner,
                                json={'full_name': 'Mijoz Ali', 'phone': '998' + str(uuid.uuid4().int)[:9]})
    assert created.status_code == 201, created.text
    customer_id = created.json()['id']
    email = f'customer-{uuid.uuid4().hex}@example.com'
    account = await client.post(f'/api/v1/customers/{customer_id}/account', headers=owner,
                               json={'email': email, 'password': PASSWORD})
    assert account.status_code == 201, account.text
    assert 'password' not in account.text
    signed = await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})
    assert signed.status_code == 200, signed.text
    tokens = signed.json()
    customer_headers = {'Authorization': 'Bearer ' + tokens['access_token']}
    me = await client.get('/api/v1/customer/me', headers=customer_headers)
    assert me.status_code == 200 and me.json()['id'] == customer_id
    # Password principals cannot use legacy Telegram mutations or draft reads.
    assert (await client.post(f'/api/v1/customer/billing/estimates/{uuid.uuid4()}/approve', headers=customer_headers)).status_code == 403
    assert (await client.get('/api/v1/customer/billing', headers=customer_headers)).status_code == 403
    assert (await client.get('/api/v1/customer/home', headers=customer_headers)).status_code == 403
    legacy = {'Authorization': 'Bearer ' + create_access_token({
        'sub': customer_id, 'scid': str(identity['center']), 'type': 'customer_access'})}
    assert (await client.get('/api/v1/customer/billing', headers=legacy)).status_code == 401
    # A real persisted non-password customer session retains Telegram policy.
    telegram = {'Authorization': 'Bearer ' + await persisted_access({
        'sub': customer_id, 'scid': str(identity['center']), 'type': 'customer_access'})}
    assert (await client.get('/api/v1/customer/billing', headers=telegram)).status_code == 200
    assert (await client.post(f'/api/v1/customer/billing/estimates/{uuid.uuid4()}/approve', headers=telegram)).status_code == 404

    assert (await client.get('/api/v1/customers', headers=customer_headers)).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=owner)).status_code == 401
    suspended = await client.patch(f'/api/v1/customers/{customer_id}/account', headers=owner,
                                   json={'is_active': False})
    assert suspended.status_code == 200
    assert (await client.get('/api/v1/customer/me', headers=customer_headers)).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=telegram)).status_code == 200
    assert (await client.post('/api/v1/customer/auth/refresh', json={'refresh_token': tokens['refresh_token']})).status_code == 401
    assert (await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})).status_code == 401
    assert (await client.patch(f'/api/v1/customers/{customer_id}/account', headers=owner, json={'is_active': True})).status_code == 200
    assert (await client.get('/api/v1/customer/me', headers=customer_headers)).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=telegram)).status_code == 200
    assert (await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})).status_code == 200


@pytest.mark.parametrize('role',['mechanic','manager','receptionist','super_admin'])
async def test_only_owner_opens_customer_passwords(client, identity, owner, role):
    customer = await client.post('/api/v1/customers',headers=owner,json={'full_name':'Ali','phone':'998'+str(uuid.uuid4().int)[:9]})
    await _as_role(identity,role)
    actor=await login(client,identity['email'])
    response=await client.post(f"/api/v1/customers/{customer.json()['id']}/account",headers=actor,
        json={'email':'role@example.com','password':PASSWORD})
    assert response.status_code==403


async def test_customer_histories_are_owned_paginated_and_customer_safe(client,identity,owner):
    customers=[]
    for name in ['Ali','Vali']:
        result=await client.post('/api/v1/customers',headers=owner,json={'full_name':name,'phone':'998'+str(uuid.uuid4().int)[:9]})
        customers.append(result.json()['id'])
    email=f'owned-{uuid.uuid4().hex}@example.com'
    assert (await client.post(f'/api/v1/customers/{customers[0]}/account',headers=owner,json={'email':email,'password':PASSWORD})).status_code==201
    async with async_session_factory() as session:
        rows=[Invoice(service_center_id=identity['center'],customer_id=uuid.UUID(customers[0]),code=f'OWN-{i:02}',kind='invoice',status='issued',currency='UZS',total=150000,balance=150000,notes='PRIVATE-STAFF') for i in range(31)]
        other=Invoice(service_center_id=identity['center'],customer_id=uuid.UUID(customers[1]),code='OTHER',kind='invoice',status='issued')
        draft=Invoice(service_center_id=identity['center'],customer_id=uuid.UUID(customers[0]),code='DRAFT-PRIVATE',kind='invoice',status='draft')
        session.add_all([*rows,other,draft]);await session.commit(); other_id=str(other.id);own_id=str(rows[0].id)
    signed=await client.post('/api/v1/customer/auth/login',json={'email':email.upper(),'password':PASSWORD})
    headers={'Authorization':'Bearer '+signed.json()['access_token']}
    first=await client.get('/api/v1/customer/history/invoices',headers=headers)
    second=await client.get('/api/v1/customer/history/invoices?page=2',headers=headers)
    assert first.status_code==second.status_code==200
    assert first.json()['total']==31 and len(first.json()['items'])==30 and len(second.json()['items'])==1
    assert not ({r['id'] for r in first.json()['items']} & {r['id'] for r in second.json()['items']})
    assert 'PRIVATE' not in first.text and 'OTHER' not in first.text
    assert (await client.get('/api/v1/customer/history/invoices/'+other_id,headers=headers)).status_code==404
    detail=await client.get('/api/v1/customer/history/invoices/'+own_id,headers=headers)
    assert detail.status_code==200 and 'notes' not in detail.text
    assert (await client.get('/api/v1/customer/history/invoices?q=%25',headers=headers)).json()['total']==0
    refreshed=await client.post('/api/v1/customer/auth/refresh',json={'refresh_token':signed.json()['refresh_token']})
    assert refreshed.status_code==200
    async with async_session_factory() as session:
        await session.execute(update(ServiceCenter).where(ServiceCenter.id==identity['center']).values(is_active=False));await session.commit()
    assert (await client.get('/api/v1/customer/me',headers=headers)).status_code==401
    assert (await client.post('/api/v1/customer/auth/login',json={'email':email,'password':PASSWORD})).status_code==401


async def test_owner_cannot_transfer_identity_or_use_foreign_customer(client,identity,owner):
    foreign_center=ServiceCenter(name='Other')
    async with async_session_factory() as session:
        session.add(foreign_center);await session.flush()
        foreign=Customer(service_center_id=foreign_center.id,full_name='Other');session.add(foreign);await session.commit(); foreign_id=str(foreign.id)
    try:
        data={'email':f'other-{uuid.uuid4().hex}@example.com','password':PASSWORD}
        assert (await client.post(f'/api/v1/customers/{foreign_id}/account',headers=owner,json=data)).status_code==404
        assert (await client.get(f'/api/v1/customers/{foreign_id}/account',headers=owner)).status_code==404
        own=await client.post('/api/v1/customers',headers=owner,json={'full_name':'Own','phone':'998'+str(uuid.uuid4().int)[:9]})
        url=f"/api/v1/customers/{own.json()['id']}/account"
        assert (await client.post(url,headers=owner,json={**data,'service_center_id':str(foreign_center.id)})).status_code==422
        assert (await client.post(url,headers=owner,json={**data,'password':'é'*40})).status_code==422
        assert (await client.post(url,headers=owner,json=data)).status_code==201
        assert (await client.post(url,headers=owner,json=data)).status_code==409
        assert (await client.patch(url,headers=owner,json={'is_active':True,'email':'change@example.com'})).status_code==422
    finally:
        from sqlalchemy import delete
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id==foreign_center.id));await session.commit()
