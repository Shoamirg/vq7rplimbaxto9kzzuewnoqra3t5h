"""Old password hashes survive; sessionless legacy JWTs explicitly require login."""
import uuid

from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import async_session_factory
from app.models import User
from app.models.customer_account import CustomerAccount
from tests.support.legacy_jwt import legacy_hs256
from tests.test_legacy_credentials import VECTORS
from tests.test_staff_access_lifecycle import client, identity, _suspend, PASSWORD
from tests.test_staff_management_api import owner


def token(claims):
    # This encoder uses no current/removed JWT library. Its byte-for-byte
    # agreement with the old issuer is verified by the frozen-vector tests.
    return legacy_hs256(dict(claims, exp=4102444800), settings.SECRET_KEY)


async def test_persisted_staff_old_hash_access_and_refresh(client, identity):
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity["user"]).values(
            password_hash=VECTORS["bcrypt_hash"]))
        await session.commit()
    signed = await client.post('/api/v1/auth/login', json={
        'email': identity['email'], 'password': VECTORS['password']})
    assert signed.status_code == 200, signed.text
    access = token({'sub': str(identity['user']), 'email': identity['email'], 'type': 'access'})
    refresh = token({'sub': str(identity['user']), 'type': 'refresh'})
    legacy_headers = {'Authorization': 'Bearer ' + access}
    assert (await client.get('/api/v1/auth/me', headers=legacy_headers)).status_code == 401
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': refresh})).status_code == 401
    headers = {'Authorization': 'Bearer ' + signed.json()['access_token']}
    me = await client.get('/api/v1/auth/me', headers=headers)
    assert me.status_code == 200 and me.json()['id'] == str(identity['user'])
    assert (await client.get('/api/v1/customer/me', headers=headers)).status_code == 401
    current_refresh = signed.json()['refresh_token']
    renewed = await client.post('/api/v1/auth/refresh', json={'refresh_token': current_refresh})
    assert renewed.status_code == 200, renewed.text
    new_headers = {'Authorization': 'Bearer ' + renewed.json()['access_token']}
    assert (await client.get('/api/v1/auth/me', headers=new_headers)).status_code == 200
    await _suspend(identity, 'user')
    assert (await client.get('/api/v1/auth/me', headers=headers)).status_code == 401
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': renewed.json()['refresh_token']})).status_code == 401


async def test_persisted_customer_old_hash_access_refresh_and_revocation(client, identity, owner):
    created = await client.post('/api/v1/customers', headers=owner, json={
        'full_name': 'Legacy customer', 'phone': '998' + str(uuid.uuid4().int)[:9]})
    assert created.status_code == 201, created.text
    customer_id = created.json()['id']
    email = f'legacy-{uuid.uuid4().hex}@example.com'
    account = await client.post(f'/api/v1/customers/{customer_id}/account', headers=owner,
                               json={'email': email, 'password': PASSWORD})
    assert account.status_code == 201, account.text
    async with async_session_factory() as session:
        saved = await session.scalar(select(CustomerAccount).where(
            CustomerAccount.customer_id == uuid.UUID(customer_id)))
        saved.password_hash = VECTORS['bcrypt_hash']
        claims = {'sub': customer_id, 'scid': str(identity['center']),
                  'account_id': str(saved.id), 'account_version': saved.version}
        await session.commit()
    signed = await client.post('/api/v1/customer/auth/login', json={
        'email': email, 'password': VECTORS['password']})
    assert signed.status_code == 200, signed.text
    access = token(dict(claims, type='customer_access'))
    refresh = token(dict(claims, type='customer_refresh'))
    legacy_headers = {'Authorization': 'Bearer ' + access}
    assert (await client.get('/api/v1/customer/me', headers=legacy_headers)).status_code == 401
    assert (await client.post('/api/v1/customer/auth/refresh', json={'refresh_token': refresh})).status_code == 401
    headers = {'Authorization': 'Bearer ' + signed.json()['access_token']}
    me = await client.get('/api/v1/customer/me', headers=headers)
    assert me.status_code == 200 and me.json()['id'] == customer_id
    assert (await client.get('/api/v1/auth/me', headers=headers)).status_code == 401
    renewed = await client.post('/api/v1/customer/auth/refresh', json={'refresh_token': signed.json()['refresh_token']})
    assert renewed.status_code == 200, renewed.text
    assert (await client.get('/api/v1/customer/me', headers={
        'Authorization': 'Bearer ' + renewed.json()['access_token']})).status_code == 200
    changed = await client.patch(f'/api/v1/customers/{customer_id}/account', headers=owner,
                                 json={'is_active': False})
    assert changed.status_code == 200
    assert (await client.get('/api/v1/customer/me', headers=headers)).status_code == 401
    assert (await client.post('/api/v1/customer/auth/refresh', json={'refresh_token': renewed.json()['refresh_token']})).status_code == 401
