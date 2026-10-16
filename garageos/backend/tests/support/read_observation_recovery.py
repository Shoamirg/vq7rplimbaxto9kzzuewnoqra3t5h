"""Normal API verification in a separate process on the freshly restored DB.

The parent supplies only synthetic fixture details via stdin. Authentication,
dependencies, migrations and SQL state are not mocked or replaced.
"""
import asyncio
import json
import sys
import uuid

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.main import app


async def verify(data):
    assert settings.ENVIRONMENT == 'test'
    path = f"/api/v1/conversations/{data['conversation']}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
        login = await client.post('/api/v1/auth/login', json={'email': data['email'], 'password': data['password']})
        assert login.status_code == 200
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        me = await client.get('/api/v1/auth/me', headers=headers)
        assert me.status_code == 200 and me.json()['id'] == data['actor']
        async with async_session_factory() as session:
            retained = set(await session.scalars(text('SELECT id FROM conversation_read_observations WHERE conversation_id=:id'), {'id': uuid.UUID(data['conversation'])}))
            assert uuid.UUID(data['before']) in retained and uuid.UUID(data['discarded']) not in retained
            messages = list((await session.execute(text('SELECT id,body FROM conversation_messages WHERE conversation_id=:id ORDER BY id'), {'id': uuid.UUID(data['conversation'])})).all())
            assert [[str(id_), body] for id_, body in messages] == data['history']
        # Reach the same generation as the discarded timeline using a different
        # real arrival. A stateless generation token would incorrectly accept it.
        new = await client.post(path + '/messages', headers=headers, json={'body': 'New arrival on restored timeline', 'author_role': 'customer'})
        assert new.status_code == 201
        denied = await client.patch(path, headers=headers, json={'mark_read': True, 'read_observation': data['discarded']})
        assert denied.status_code == 422 and denied.json()['error']['code'] == 'CONVERSATION_READ_OBSERVATION_INVALID'
        current = await client.get(path, headers=headers)
        assert current.status_code == 200 and current.json()['unread_messages'] == 2
        for _ in range(2):
            accepted = await client.patch(path, headers=headers, json={'mark_read': True, 'read_observation': data['before']})
            assert accepted.status_code == 200
            assert (await client.get(path, headers=headers)).json()['unread_messages'] == 1
        next_arrival = await client.post(path + '/messages', headers=headers, json={'body': 'Another restored arrival', 'author_role': 'customer'})
        assert next_arrival.status_code == 201
        assert (await client.patch(path, headers=headers, json={'mark_read': True, 'read_observation': data['before']})).status_code == 200
        final = await client.get(path, headers=headers)
        assert final.status_code == 200 and final.json()['unread_messages'] == 2
        async with async_session_factory() as session:
            row = (await session.execute(text('SELECT message_generation,acknowledged_message_generation,unread_messages,service_center_id FROM conversations WHERE id=:id'), {'id': uuid.UUID(data['conversation'])})).one()
            assert tuple(row) == (3, 1, 2, uuid.UUID(data['center']))
    return {'password_login': True, 'discarded_observation_rejected_after_generation_catchup': True,
            'retained_observation_preserves_new_arrivals': True, 'final_generations': [3, 1, 2]}


async def main():
    try:
        result = await verify(json.load(sys.stdin))
        print('RECOVERY_RESULT=' + json.dumps(result))
    finally:
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
