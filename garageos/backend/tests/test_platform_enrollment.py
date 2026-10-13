"""Trusted enrollment observed through the real operator CLI and authenticated HTTP."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
import uuid

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select, update
from sqlalchemy import text

from app.core.database import async_session_factory, engine
from app.core.database import Base
from tests.support.auth_sessions import persisted_access
from app.core.security import hash_password
from app.main import app
from app.models import Customer, Role, ServiceCenter, User

BACKEND = Path(__file__).resolve().parents[1]
PASSWORD = "Platform-test-only-2026!"
PASSWORD_ENV = "GARAGEOS_PLATFORM_TEST_PASSWORD"


@pytest_asyncio.fixture
async def enrollment(tmp_path):
    tag = uuid.uuid4().hex
    created_roles = []
    async with async_session_factory() as session:
        for name in ('super_admin', 'admin'):
            role = await session.scalar(select(Role).where(Role.name == name))
            if role is None:
                role = Role(name=name)
                session.add(role)
                await session.flush()
                created_roles.append(role.id)
        own, other = ServiceCenter(name=f'Enrollment {tag}'), ServiceCenter(name=f'Other {tag}')
        session.add_all([own, other])
        await session.flush()
        customers = [Customer(service_center_id=center.id, full_name=f'Visible {tag}-{i}')
                     for i, center in enumerate([own, other])]
        session.add_all(customers)
        await session.commit()
        ids = {'own': own.id, 'other': other.id, 'customers': [c.id for c in customers], 'tag': tag}
    config = {'service_center_id': str(ids['own']), 'email': f'platform-{tag}@example.com',
              'full_name': 'Platform operator', 'password_env': PASSWORD_ENV}
    path = tmp_path / 'platform.json'
    path.write_text(json.dumps(config), encoding='utf-8')
    try:
        yield config, path, ids
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id.in_([ids['own'], ids['other']])))
            if created_roles:
                await session.execute(delete(Role).where(Role.id.in_(created_roles)))
            await session.commit()
        await engine.dispose()


async def _command(path, *, apply=False, password=PASSWORD, extra_env=None, extra_args=()):
    env = dict(os.environ)
    if password is None:
        env.pop(PASSWORD_ENV, None)
    else:
        env[PASSWORD_ENV] = password
    env.update(extra_env or {})
    args = [sys.executable, '-m', 'app.commands.enroll_platform', '--config', str(path)]
    if apply:
        args.append('--apply')
    args.extend(extra_args)
    process = await asyncio.create_subprocess_exec(*args, cwd=BACKEND, env=env,
                                                 stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        output, errors = await asyncio.wait_for(process.communicate(), timeout=60)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise
    return process.returncode, output.decode(), errors.decode()


async def _login(client, email, password=PASSWORD):
    result = await client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    assert result.status_code == 200, result.text
    return result.json(), {'Authorization': 'Bearer ' + result.json()['access_token']}


async def _counts():
    async with async_session_factory() as session:
        return {name: await session.scalar(select(func.count()).select_from(table))
                for name, table in Base.metadata.tables.items()}


async def _account(email):
    async with async_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == email))
        return None if user is None else {key: getattr(user, key) for key in (
            'id', 'email', 'full_name', 'password_hash', 'role_id', 'service_center_id',
            'is_super_admin', 'is_active', 'created_at', 'updated_at')}


async def test_operator_enrollment_opens_platform_reads_without_promoting_an_owner(enrollment):
    config, path, ids = enrollment
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == 'admin'))
        owner = User(service_center_id=ids['own'], role_id=role.id, email=f'owner-{ids["tag"]}@example.com',
                     full_name='Unchanged owner', password_hash=hash_password(PASSWORD), is_super_admin=False)
        session.add(owner)
        await session.commit()
        owner_id, original_hash = owner.id, owner.password_hash
    counts = await _counts()
    code, output, errors = await _command(path, password=None)
    assert code == 0, errors
    plan = json.loads(output)
    assert plan['applied'] is False and plan['account']['state'] == 'create'
    assert plan['account']['id'] is None
    assert plan['account']['role'] == 'super_admin' and plan['account']['is_super_admin'] is True
    assert plan['account']['service_center_id'] == config['service_center_id']
    assert plan['access'] == {'platform': ['platform.read'], 'anchoring_garage': ['staff.read', 'staff.write']}
    assert await _counts() == counts
    async with async_session_factory() as session:
        assert await session.scalar(select(User.id).where(User.email == config['email'])) is None
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    result = json.loads(output)
    assert result['applied'] is True and result['account']['state'] == 'created'
    assert PASSWORD not in output + errors and 'password_hash' not in output
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        _, headers = await _login(client, config['email'])
        profile = (await client.get('/api/v1/auth/me', headers=headers)).json()
        assert profile['id'] == result['account']['id'] and profile['role'] == 'super_admin'
        assert profile['platform_permissions'] == ['platform.read']
        assert profile['permissions'] == ['staff.read', 'staff.write']
        global_rows = await client.get('/api/v1/platform/records/customers', params={'q': ids['tag']}, headers=headers)
        assert global_rows.status_code == 200, global_rows.text
        assert {row['id'] for row in global_rows.json()['items']} == {str(i) for i in ids['customers']}
        tenant_rows = await client.get('/api/v1/customers', params={'q': ids['tag']}, headers=headers)
        assert tenant_rows.status_code == 200
        assert {row['id'] for row in tenant_rows.json()['items']} == {str(ids['customers'][0])}
        denied = await client.get(f'/api/v1/customers/{ids["customers"][1]}', headers=headers)
        assert denied.status_code == 404
        assert (await client.post('/api/v1/platform/records/customers', json={}, headers=headers)).status_code == 405
        _, owner_headers = await _login(client, owner.email)
        assert (await client.get('/api/v1/platform/stats', headers=owner_headers)).status_code == 403
        assert (await client.post('/api/v1/platform/enroll', json=config, headers=owner_headers)).status_code == 404
        refused = await client.post('/api/v1/staff', headers=owner_headers, json={
            'email': f'http-platform-{ids["tag"]}@example.com', 'full_name': 'Refused elevation',
            'password': PASSWORD, 'role': 'super_admin', 'is_super_admin': True,
        })
        assert refused.status_code == 422
    async with async_session_factory() as session:
        unchanged = await session.get(User, owner_id)
        assert unchanged.password_hash == original_hash and unchanged.is_super_admin is False
        assert unchanged.role.name == 'admin'


async def test_exact_reapply_preserves_identity_password_and_all_data(enrollment):
    config, path, _ = enrollment
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    original = await _account(config['email'])
    counts = await _counts()
    # Incoming case is normalized; existing canonical identity stays unchanged.
    config['email'] = config['email'].upper()
    path.write_text(json.dumps(config), encoding='utf-8')
    for apply, password, state in [(False, None, 'keep'), (True, None, 'kept'),
                                    (True, 'Different-valid-password-2026!', 'kept')]:
        code, output, errors = await _command(path, apply=apply, password=password)
        assert code == 0, errors
        assert json.loads(output)['account']['id'] == str(original['id'])
        assert json.loads(output)['account']['state'] == state
        assert await _account(original['email']) == original
        assert await _counts() == counts
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        await _login(client, original['email'])
        assert (await client.post('/api/v1/auth/login', json={
            'email': original['email'], 'password': 'Different-valid-password-2026!',
        })).status_code == 401


@pytest.mark.parametrize('kind', ['owner', 'owner_flag', 'role_only', 'inactive', 'other_garage', 'name', 'legacy_case', 'ambiguous'])
async def test_conflicting_identity_is_never_promoted_or_overwritten(enrollment, kind):
    config, path, ids = enrollment
    async with async_session_factory() as session:
        role_name = 'admin' if kind in {'owner', 'owner_flag'} else 'super_admin'
        role = await session.scalar(select(Role).where(Role.name == role_name))
        user = User(email=config['email'].upper() if kind == 'legacy_case' else config['email'],
                    full_name='Different identity' if kind == 'name' else config['full_name'],
                    role_id=role.id, service_center_id=ids['other'] if kind == 'other_garage' else ids['own'],
                    password_hash=hash_password(PASSWORD), is_super_admin=kind not in {'owner', 'role_only'},
                    is_active=kind != 'inactive')
        session.add(user)
        if kind == 'ambiguous':
            session.add(User(email=config['email'].upper(), full_name=config['full_name'], role_id=role.id,
                             service_center_id=ids['own'], password_hash=hash_password(PASSWORD), is_super_admin=True))
        await session.commit()
    original, counts = await _account(user.email), await _counts()
    for apply in [False, True]:
        code, output, errors = await _command(path, apply=apply)
        assert code == 2 and 'Platform enrollment failed:' in errors
        assert not output and 'Traceback' not in errors
        assert PASSWORD not in errors
        assert await _account(user.email) == original and await _counts() == counts


@pytest.mark.parametrize('password', [None, 'demo1234', ' ' * 12, 'x' * 73, '😀' * 20])
async def test_new_password_failure_is_atomic_and_sanitized(enrollment, password):
    config, path, _ = enrollment
    counts = await _counts()
    code, output, errors = await _command(path, apply=True, password=password, extra_env={'DEBUG': 'true'})
    assert code == 2 and not output and 'Platform enrollment failed:' in errors and 'Traceback' not in errors
    if password is not None:
        assert password not in errors
    assert await _account(config['email']) is None and await _counts() == counts


@pytest.mark.parametrize('password', ['x' * 72, '😀' * 18])
async def test_password_at_utf8_byte_boundary_can_sign_in(enrollment, password):
    config, path, _ = enrollment
    code, output, errors = await _command(path, apply=True, password=password, extra_env={'DEBUG': 'true'})
    assert code == 0, errors
    assert password not in output + errors and '$2' not in output + errors
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        await _login(client, config['email'], password)


@pytest.mark.parametrize('field,value', [
    ('password', PASSWORD), ('password_hash', 'private-input-hash'), ('role', 'admin'), ('is_super_admin', False),
    ('password_env', 'DATABASE_URL'), ('full_name', '   '), ('email', 'invalid-email'), ('service_center_id', 'not-a-uuid'),
])
async def test_untrusted_manifest_fields_are_rejected_without_echo(enrollment, field, value):
    config, path, _ = enrollment
    config[field] = value
    path.write_text(json.dumps(config), encoding='utf-8')
    counts = await _counts()
    code, output, errors = await _command(path, apply=True)
    assert code == 2 and not output and 'Invalid or unreadable config' in errors
    assert PASSWORD not in errors and 'private-input-hash' not in errors and 'Traceback' not in errors
    assert await _counts() == counts


@pytest.mark.parametrize('kind', ['missing_garage', 'inactive_garage', 'missing_role', 'inactive_role', 'pending_migration'])
async def test_setup_dependencies_fail_before_any_write(enrollment, kind):
    config, path, ids = enrollment
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == 'super_admin'))
        original_role_active = role.is_active
        heads = list((await session.scalars(text('SELECT version_num FROM alembic_version'))).all())
        if kind == 'missing_garage':
            config['service_center_id'] = str(uuid.uuid4())
            path.write_text(json.dumps(config), encoding='utf-8')
        elif kind == 'inactive_garage':
            await session.execute(update(ServiceCenter).where(ServiceCenter.id == ids['own']).values(is_active=False))
        elif kind == 'missing_role':
            await session.execute(update(Role).where(Role.id == role.id).values(name=f'Hidden-{ids["tag"]}'))
        elif kind == 'inactive_role':
            await session.execute(update(Role).where(Role.id == role.id).values(is_active=False))
        else:
            await session.execute(text('UPDATE alembic_version SET version_num = :head'), {'head': 'unapplied-platform-head'})
        await session.commit()
    counts = await _counts()
    try:
        for apply in [False, True]:
            code, output, errors = await _command(path, apply=apply)
            assert code == 2 and not output and 'Platform enrollment failed:' in errors
            assert 'Traceback' not in errors and await _counts() == counts
            assert await _account(config['email']) is None
    finally:
        async with async_session_factory() as session:
            await session.execute(update(Role).where(Role.id == role.id).values(name='super_admin', is_active=original_role_active))
            if kind == 'pending_migration':
                await session.execute(text('DELETE FROM alembic_version'))
                for head in heads:
                    await session.execute(text('INSERT INTO alembic_version(version_num) VALUES (:head)'), {'head': head})
            await session.commit()


async def test_parallel_identical_apply_converges_to_one_account(enrollment):
    config, path, _ = enrollment
    results = await asyncio.gather(_command(path, apply=True), _command(path, apply=True))
    assert all(code == 0 for code, _, _ in results), results
    accounts = [json.loads(output)['account'] for _, output, _ in results]
    assert {account['state'] for account in accounts} == {'created', 'kept'}
    assert len({account['id'] for account in accounts}) == 1
    async with async_session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User).where(User.email == config['email'])) == 1


@pytest.mark.parametrize('kind', ['user', 'garage', 'role', 'flag', 'role_only', 'demo'])
async def test_enrolled_platform_access_rechecks_identity_on_every_request(enrollment, kind):
    config, path, ids = enrollment
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    user_id = uuid.UUID(json.loads(output)['account']['id'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        tokens, headers = await _login(client, config['email'])
        assert (await client.get('/api/v1/platform/stats', headers=headers)).status_code == 200
        async with async_session_factory() as session:
            role = await session.scalar(select(Role).where(Role.name == 'super_admin'))
            original_role_active = role.is_active
            if kind == 'user':
                await session.execute(update(User).where(User.id == user_id).values(is_active=False))
            elif kind == 'garage':
                await session.execute(update(ServiceCenter).where(ServiceCenter.id == ids['own']).values(is_active=False))
            elif kind == 'role':
                await session.execute(update(Role).where(Role.id == role.id).values(is_active=False))
            elif kind == 'flag':
                await session.execute(update(User).where(User.id == user_id).values(is_super_admin=False))
            elif kind == 'role_only':
                admin = await session.scalar(select(Role).where(Role.name == 'admin'))
                await session.execute(update(User).where(User.id == user_id).values(role_id=admin.id))
            else:
                headers = {'Authorization': 'Bearer ' + await persisted_access({'sub': str(user_id), 'type': 'access', 'demo': True})}
            await session.commit()
        try:
            assert (await client.get('/api/v1/platform/stats', headers=headers)).status_code == (401 if kind in {'user', 'garage', 'role'} else 403)
            if kind in {'user', 'garage', 'role'}:
                assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': tokens['refresh_token']})).status_code == 401
                assert (await client.post('/api/v1/auth/login', json={'email': config['email'], 'password': PASSWORD})).status_code == 401
        finally:
            if kind == 'role':
                async with async_session_factory() as session:
                    await session.execute(update(Role).where(Role.id == role.id).values(is_active=original_role_active))
                    await session.commit()


@pytest.mark.parametrize('extra_env,extra_args', [
    ({'DATABASE_URL': 'not-a-db-password-sentinel'}, ()),
    ({'ENVIRONMENT': 'private-config-sentinel'}, ()),
    ({}, ('--password', 'private-argument-sentinel')),
])
async def test_initialization_and_argument_errors_do_not_echo_private_values(enrollment, extra_env, extra_args):
    _, path, _ = enrollment
    code, output, errors = await _command(path, apply=True, extra_env=extra_env, extra_args=extra_args)
    assert code == 2 and not output and 'Platform enrollment failed:' in errors
    assert 'Traceback' not in errors
    for secret in ['not-a-db-password-sentinel', 'private-config-sentinel', 'private-argument-sentinel', PASSWORD]:
        assert secret not in output + errors


async def test_database_commit_rejection_rolls_back_and_reports_unknown_status_safely(enrollment):
    config, path, ids = enrollment
    # Owned UUID names and fixture email contain no SQL quoting characters.
    name = 'enrollment_' + ids['tag']
    async with async_session_factory() as session:
        await session.execute(text(f"""CREATE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.email = '{config['email']}' THEN RAISE EXCEPTION 'private-database-error-sentinel';
            END IF; RETURN NEW; END $$"""))
        await session.execute(text(f'CREATE CONSTRAINT TRIGGER {name} AFTER INSERT ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION {name}()'))
        await session.commit()
    counts = await _counts()
    try:
        code, output, errors = await _command(path, apply=True, extra_env={'DATABASE_ECHO': 'true'})
        assert code == 2 and not output and 'commit status may be unknown' in errors
        for hidden in [PASSWORD, 'private-database-error-sentinel', '$2', 'Traceback', config['email']]:
            assert hidden not in errors
        assert await _account(config['email']) is None and await _counts() == counts
    finally:
        async with async_session_factory() as session:
            await session.execute(text(f'DROP TRIGGER {name} ON users'))
            await session.execute(text(f'DROP FUNCTION {name}()'))
            await session.commit()
    # Read-only recovery plan still reports create; retry after fixing the cause.
    code, output, errors = await _command(path, password=None)
    assert code == 0, errors
    assert json.loads(output)['account']['state'] == 'create'


@pytest.mark.parametrize('kind', ['missing', 'invalid_utf8', 'invalid_json'])
async def test_unreadable_or_invalid_config_fails_without_echo(enrollment, kind):
    _, path, _ = enrollment
    if kind == 'missing':
        path.unlink()
    elif kind == 'invalid_utf8':
        path.write_bytes(b'\xffprivate-config-content-sentinel')
    else:
        path.write_text('{private-config-content-sentinel', encoding='utf-8')
    code, output, errors = await _command(path, apply=True)
    assert code == 2 and not output and 'Invalid or unreadable config' in errors
    assert 'private-config-content-sentinel' not in errors and 'Traceback' not in errors
