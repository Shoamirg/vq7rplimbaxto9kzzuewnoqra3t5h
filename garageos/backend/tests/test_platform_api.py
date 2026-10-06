"""Global platform reads remain distinct from tenant workspace access."""
from sqlalchemy import update

from app.core.database import async_session_factory
from app.models import User
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
