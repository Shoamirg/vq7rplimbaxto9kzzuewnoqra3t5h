"""Actual API probe in a separately configured, owned SQL_ASCII test database."""
import asyncio
import json
import secrets

import httpx
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.main import app
from app.models import Role, ServiceCenter, User
from app.models.operational_case import OperationalCase


async def main():
    assert settings.ENVIRONMENT == 'test'
    password = secrets.token_urlsafe(32)
    async with async_session_factory() as session:
        database = await session.scalar(text('SELECT current_database()'))
        assert database.startswith('case_search_encoding_qa_')
        assert await session.scalar(text("SELECT current_setting('server_encoding')")) == 'SQL_ASCII'
        assert await session.scalar(text("SELECT count(*) FROM pg_catalog.pg_collation WHERE collname='und-x-icu' AND collprovider='i' AND collisdeterministic AND collencoding=-1")) == 1
        assert await session.scalar(text("SELECT pg_catalog.to_regcollation('pg_catalog.\"und-x-icu\"')")) is None
        role, center = Role(name='admin'), ServiceCenter(name='Owned encoding QA')
        session.add_all([role, center])
        await session.flush()
        owner = User(role_id=role.id, service_center_id=center.id, full_name='Owner',
            email='encoding-qa@example.com', password_hash=hash_password(password))
        session.add(owner)
        await session.commit()
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
            login = await client.post('/api/v1/auth/login', json={'email': owner.email, 'password': password})
            assert login.status_code == 200
            headers = {'Authorization': 'Bearer '+login.json()['access_token']}
            no_search = await client.get('/api/v1/cases', headers=headers)
            searched = await client.get('/api/v1/cases?q=anything', headers=headers)
            assert no_search.status_code == 200 and no_search.json()['items'] == [] and no_search.json()['total'] == 0
            code = searched.json().get('error', {}).get('code')
        async with async_session_factory() as session:
            assert await session.scalar(select(func.count()).select_from(OperationalCase)) == 0
        print(json.dumps(dict(no_search_status=200, search_status=searched.status_code, error_code=code,
            real_password_auth=True, no_dependency_overrides=True, unsupported_encoding='SQL_ASCII')))
    finally:
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
