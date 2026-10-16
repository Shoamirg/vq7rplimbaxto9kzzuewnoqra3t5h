"""A complete real PostgreSQL backup/fresh restore preserves read boundaries."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import uuid

import asyncpg
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import async_session_factory
from tests.test_message_intent_api import client, identity, owner, target  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD

BACKEND = Path(__file__).resolve().parents[1]


def postgres_tool(name):
    executable = shutil.which(name)
    if executable:
        return executable
    if os.name == 'nt':
        installations = Path(os.environ['ProgramFiles']) / 'PostgreSQL'
        for directory in sorted(installations.glob('*/bin'), reverse=True):
            executable = directory / (name + '.exe')
            if executable.is_file():
                return str(executable)
    raise AssertionError(f'{name} is required for the actual PostgreSQL recovery test')


async def run_owned(args, env, *, input_data=None):
    options = {'creationflags': 0x08000000} if os.name == 'nt' else {}
    process = await asyncio.create_subprocess_exec(*args, cwd=BACKEND, env=env,
        stdin=asyncio.subprocess.PIPE if input_data is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, **options)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(input_data), timeout=120)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    # Connection passwords stay in environment, never in command arguments.
    assert process.returncode == 0, stderr.decode(errors='replace')[-2000:]
    return stdout.decode(errors='replace')


async def test_full_backup_fresh_restore_rejects_discarded_authority_and_preserves_new_arrivals(client, target, identity):
    source = make_url(settings.DATABASE_URL)
    assert settings.ENVIRONMENT == 'test' and source.database == 'garage_test'
    assert source.host in {'localhost', '127.0.0.1', '::1'}
    path = f"/api/v1/conversations/{target['id']}"
    first = await client.post(path + '/messages', headers=target['staff'], json={'body': 'Arrival retained in backup', 'author_role': 'customer'})
    assert first.status_code == 201
    before = await client.get(path, headers=target['staff'])
    assert before.status_code == 200 and before.json()['unread_messages'] == 1
    async with async_session_factory() as session:
        history = [(str(id_), body) for id_, body in (await session.execute(text('SELECT id,body FROM conversation_messages WHERE conversation_id=:id ORDER BY id'), {'id': uuid.UUID(target['id'])})).all()]
    admin = await asyncpg.connect(source.set(drivername='postgresql').render_as_string(hide_password=False))
    name = 'garage_read_restore_' + uuid.uuid4().hex
    child = source.set(database=name)
    env = {**os.environ, 'PGHOST': source.host, 'PGPORT': str(source.port or 5432),
           'PGUSER': source.username or '', 'PGPASSWORD': source.password or '',
           'PGCONNECT_TIMEOUT': '10', 'RATE_LIMIT_ENABLED': 'false',
           'ENVIRONMENT': 'test', 'PYTHONUTF8': '1'}
    created = False
    # A unique private directory is the only filesystem object we remove. The
    # full database dump can contain synthetic credentials and is never archived.
    directory = Path(tempfile.mkdtemp(prefix='garageos-read-restore-')).resolve()
    marker = directory / 'OWNER'
    marker.write_text(name, encoding='utf-8')
    try:
        dump = directory / 'complete.dump'
        await run_owned([postgres_tool('pg_dump'), '--format=custom', '--file', str(dump), '--dbname', source.database], env)
        assert dump.stat().st_size > 0
        second = await client.post(path + '/messages', headers=target['staff'], json={'body': 'Discarded post-backup arrival', 'author_role': 'customer'})
        assert second.status_code == 201
        discarded = await client.get(path, headers=target['staff'])
        assert discarded.status_code == 200 and discarded.json()['unread_messages'] == 2
        await admin.execute(f'CREATE DATABASE "{name}"')
        created = True
        await run_owned([postgres_tool('pg_restore'), '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', name, str(dump)], env)
        child_env = {**env, 'DATABASE_URL': child.render_as_string(hide_password=False)}
        data = {'conversation': target['id'], 'actor': str(identity['user']), 'center': str(identity['center']),
                'email': identity['email'], 'password': PASSWORD, 'before': before.json()['read_observation'],
                'discarded': discarded.json()['read_observation'], 'history': history}
        output = await run_owned([sys.executable, '-m', 'tests.support.read_observation_recovery'], child_env,
                                 input_data=json.dumps(data).encode())
        results = [line.removeprefix('RECOVERY_RESULT=') for line in output.splitlines() if line.startswith('RECOVERY_RESULT=')]
        assert len(results) == 1
        result = json.loads(results[0])
        assert result == {'password_login': True, 'discarded_observation_rejected_after_generation_catchup': True,
                          'retained_observation_preserves_new_arrivals': True, 'final_generations': [3, 1, 2]}
        # Independent restored database read proves the consumer's assertions,
        # while the original timeline remains untouched by the child process.
        restored = await asyncpg.connect(child.set(drivername='postgresql').render_as_string(hide_password=False))
        try:
            row = await restored.fetchrow('SELECT message_generation,acknowledged_message_generation,unread_messages FROM conversations WHERE id=$1', uuid.UUID(target['id']))
            assert tuple(row) == (3, 1, 2)
            assert await restored.fetchval('SELECT count(*) FROM conversation_read_observations WHERE id=$1', uuid.UUID(discarded.json()['read_observation'])) == 0
        finally:
            await restored.close()
        async with async_session_factory() as session:
            row = (await session.execute(text('SELECT message_generation,acknowledged_message_generation,unread_messages FROM conversations WHERE id=:id'), {'id': uuid.UUID(target['id'])})).one()
            assert tuple(row) == (2, 0, 2)
    finally:
        try:
            if created:
                await admin.execute(f'DROP DATABASE "{name}"')
                assert await admin.fetchval('SELECT 1 FROM pg_database WHERE datname=$1', name) is None
        finally:
            await admin.close()
            assert directory.parent == Path(tempfile.gettempdir()).resolve()
            assert directory.name.startswith('garageos-read-restore-') and marker.read_text(encoding='utf-8') == name
            shutil.rmtree(directory)
            assert not directory.exists()
