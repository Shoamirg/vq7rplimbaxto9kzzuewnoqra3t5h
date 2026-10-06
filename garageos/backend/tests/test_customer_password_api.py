import uuid

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
    assert (await client.get('/api/v1/customers', headers=customer_headers)).status_code == 401
    assert (await client.get('/api/v1/customer/me', headers=owner)).status_code == 401
    suspended = await client.patch(f'/api/v1/customers/{customer_id}/account', headers=owner,
                                   json={'is_active': False})
    assert suspended.status_code == 200
    assert (await client.get('/api/v1/customer/me', headers=customer_headers)).status_code == 401
    assert (await client.post('/api/v1/customer/auth/refresh', json={'refresh_token': tokens['refresh_token']})).status_code == 401
    assert (await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})).status_code == 401
    assert (await client.patch(f'/api/v1/customers/{customer_id}/account', headers=owner, json={'is_active': True})).status_code == 200
    assert (await client.get('/api/v1/customer/me', headers=customer_headers)).status_code == 401
    assert (await client.post('/api/v1/customer/auth/login', json={'email': email, 'password': PASSWORD})).status_code == 200
