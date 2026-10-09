"""Observed shared unread boundary through normal auth and real PostgreSQL.

These are desired owning-boundary contracts, pending runtime red/green. No
authentication or application response is replaced with a test double.
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError

from app.core.database import async_session_factory
from app.core.events import event_bus
from app.models import User
from app.models.conversation import Conversation, Participant
from app.models.conversation_read_observation import ConversationReadObservation
from app.repositories.unit_of_work import UnitOfWork
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_case_reference_safety_api import references  # noqa: F401
from tests.test_inbox_mutations_api import create
from tests.test_case_reference_safety_api import open_case
from tests.test_message_intent_api import owner, target  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401
from tests.test_transaction_response_api import Operation, send_observed


async def observe(client, refs, target, *, headers=None):
    response = await client.get(f'/api/v1/conversations/{target}', headers=headers or refs['admin'])
    assert response.status_code == 200, response.text
    observation = response.json().get('read_observation')
    assert isinstance(observation, str) and str(uuid.UUID(observation)) == observation
    return response.json(), observation


async def incoming(client, refs, target, text='New recorded customer reply'):
    response = await client.post(f'/api/v1/conversations/{target}/messages',
        headers={**refs['admin'], 'Idempotency-Key': str(uuid.uuid4())},
        json={'body': text, 'author_role': 'customer'})
    assert response.status_code == 201, response.text
    return response.json()['id']


async def counters(target):
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        return row.unread_messages, row.unread_activity


async def acknowledge(client, refs, target, observation, **changes):
    return await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
        json={'mark_read': True, 'read_observation': observation, **changes})


async def wait_for_owned_lock_waiters(blocker_pid, expected):
    """Observe real lock waits rooted at this test's exact PostgreSQL session.

    PostgreSQL can queue a later waiter behind another waiter, so follow the
    blocking PID graph instead of counting unrelated database lock activity.
    The blocker holds one synthetic target row or its observation row.
    """
    async with asyncio.timeout(10):
        while True:
            async with async_session_factory() as session:
                waiting = list(await session.scalars(text("""
                    WITH RECURSIVE owned_waiters(pid) AS (
                        SELECT pid FROM pg_stat_activity
                        WHERE :blocker = ANY(pg_blocking_pids(pid))
                        UNION
                        SELECT activity.pid FROM pg_stat_activity activity
                        JOIN owned_waiters parent ON parent.pid = ANY(pg_blocking_pids(activity.pid))
                    )
                    SELECT activity.pid FROM pg_stat_activity activity
                    JOIN owned_waiters waiter ON waiter.pid = activity.pid
                    JOIN pg_locks lock ON lock.pid = activity.pid
                    WHERE activity.datname = current_database()
                        AND activity.wait_event_type = 'Lock'
                        AND lock.relation = 'public.conversations'::regclass
                        AND lock.mode = 'RowShareLock' AND lock.granted
                """), {'blocker': blocker_pid}))
            if len(set(waiting)) >= expected:
                return set(waiting)
            await asyncio.sleep(.02)


async def drain_requests(tasks):
    try:
        return await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=20)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def test_old_observation_retains_later_message_and_activity(client, references, monkeypatch):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target, 'First recorded message')
    initial, observation = await observe(client, refs, target)
    assert (initial['unread_messages'], initial['unread_activity']) == (1, 0)
    await incoming(client, refs, target, 'Unseen new message')
    changed = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'],
        json={'status': 'waiting_technician'})
    assert changed.status_code == 200
    events = []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    for _ in range(2):
        response = await acknowledge(client, refs, target, observation)
        assert response.status_code == 200, response.text
        assert await counters(target) == (1, 1)
    assert not events
    current, newer = await observe(client, refs, target)
    assert (current['unread_messages'], current['unread_activity']) == (1, 1)
    assert (await acknowledge(client, refs, target, newer)).status_code == 200
    assert await counters(target) == (0, 0)
    assert (await acknowledge(client, refs, target, observation)).status_code == 200
    assert await counters(target) == (0, 0)


async def test_combined_patch_does_not_acknowledge_its_unseen_new_activity(client, references):
    refs = references
    target = await create(client, refs)
    _, observation = await observe(client, refs, target)
    response = await acknowledge(client, refs, target, observation, status='resolved',
        assigned_user_id=refs['ids'][0])
    assert response.status_code == 200, response.text
    assert await counters(target) == (0, 1)
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.status == 'resolved' and str(row.assigned_user_id) == refs['ids'][0]


async def test_missing_unknown_or_other_target_observation_has_no_effect(client, references, monkeypatch):
    refs = references
    target, other = await create(client, refs), await create(client, refs)
    _, observation = await observe(client, refs, other)
    await incoming(client, refs, target)
    events = []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    for body in [{'mark_read': True}, {'mark_read': True, 'read_observation': 'malformed'},
        {'mark_read': True, 'read_observation': str(uuid.uuid4())},
        {'mark_read': True, 'read_observation': observation, 'status': 'resolved'}]:
        response = await client.patch(f'/api/v1/conversations/{target}', headers=refs['admin'], json=body)
        assert response.status_code == 422, response.text
        assert await counters(target) == (1, 0)
        async with async_session_factory() as session:
            row = await session.get(Conversation, uuid.UUID(target))
            assert row.status == 'open'
    assert not events


async def test_observation_is_bound_to_authenticated_staff_not_same_name(client, references, identity):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as session:
        original = await session.get(User, identity['user'])
        other = User(service_center_id=identity['center'], role_id=original.role_id,
            full_name=original.full_name, email=f'observer-{uuid.uuid4().hex}@example.com',
            password_hash=original.password_hash)
        session.add(other)
        await session.commit()
        other_email = other.email
    login = await client.post('/api/v1/auth/login', json={'email': other_email, 'password': PASSWORD})
    assert login.status_code == 200, login.text
    response = await client.patch(f'/api/v1/conversations/{target}',
        headers={'Authorization': 'Bearer '+login.json()['access_token']},
        json={'mark_read': True, 'read_observation': observation})
    assert response.status_code == 422
    assert await counters(target) == (1, 0)


async def test_current_revocation_overrides_retained_observation(client, references, identity):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity['user']).values(is_active=False))
        await session.commit()
    response = await acknowledge(client, refs, target, observation)
    assert response.status_code == 401
    assert await counters(target) == (1, 0)


async def test_current_permission_reduction_overrides_observation(client, references, identity):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity['user']).values(role_id=refs['role']))
        await session.commit()
    response = await acknowledge(client, refs, target, observation)
    assert response.status_code == 403
    assert await counters(target) == (1, 0)


async def test_compromised_child_overrides_retained_observation(client, references):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as session:
        session.add(Participant(service_center_id=refs['foreign_center'], conversation_id=uuid.UUID(target),
            display_name='FOREIGN-PRIVATE', role='watcher'))
        await session.commit()
    response = await acknowledge(client, refs, target, observation)
    assert response.status_code == 404 and 'FOREIGN-PRIVATE' not in response.text
    assert await counters(target) == (1, 0)


async def test_overlapping_message_and_duplicate_ack_preserve_new_arrivals(client, references):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target, 'Observed message')
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as blocker:
        await blocker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target)).with_for_update())
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        writes = [asyncio.create_task(incoming(client, refs, target, 'New arrival '+str(i))) for i in range(4)]
        reads = [asyncio.create_task(acknowledge(client, refs, target, observation)) for _ in range(4)]
        try:
            await wait_for_owned_lock_waiters(blocker_pid, len(writes+reads))
            assert not any(task.done() for task in writes+reads)
        finally:
            await blocker.rollback()
            # Drain every request even on a failed pending-state assertion so
            # fixture cleanup never races abandoned mutations.
            results = await drain_requests(writes+reads)
    assert not any(isinstance(result, BaseException) for result in results)
    assert len(set(results[:4])) == 4
    assert all(response.status_code == 200 for response in results[4:])
    assert await counters(target) == (4, 0)


async def test_concurrent_get_observation_matches_its_returned_history(client, references):
    refs = references
    target = await create(client, refs)
    first = await incoming(client, refs, target, 'Earlier observed history')
    async with async_session_factory() as blocker:
        await blocker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target)).with_for_update())
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        thread = asyncio.create_task(client.get(f'/api/v1/conversations/{target}', headers=refs['admin']))
        arrivals = [asyncio.create_task(incoming(client, refs, target, 'Racing history '+str(i))) for i in range(6)]
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 1+len(arrivals))
            assert not any(task.done() for task in [thread, *arrivals])
        finally:
            await blocker.rollback()
            results = await drain_requests([thread, *arrivals])
    assert not any(isinstance(result, BaseException) for result in results)
    response = results[0]
    assert response.status_code == 200
    observed = response.json()
    message_ids = {message['id'] for message in observed['messages']}
    assert first in message_ids and message_ids <= {first, *results[1:]}
    assert (await acknowledge(client, refs, target, observed['read_observation'])).status_code == 200
    assert await counters(target) == (7-len(message_ids), 0)


async def test_observation_is_durable_before_first_success_send(client, references):
    refs = references
    target = await create(client, refs)

    async def read():
        # Keep the pre-implementation observer valid: an absent real table is
        # no committed observation, not an import error in the ASGI harness.
        async with async_session_factory() as session:
            exists = await session.scalar(text("SELECT to_regclass('public.conversation_read_observations') IS NOT NULL"))
            if not exists:
                return ()
            return tuple(await session.scalars(text(
                'SELECT id FROM conversation_read_observations '
                'WHERE service_center_id = :center AND conversation_id = :conversation'),
                {'center': refs['center'], 'conversation': uuid.UUID(target)}))

    operation = Operation('inbox-observe', 'GET', f'/api/v1/conversations/{target}', refs['admin'], None, read)
    observations, statuses = [], []
    response = await send_observed(operation, observations, statuses)
    assert response.status_code == 200 and statuses == [200]
    observation = response.json().get('read_observation')
    assert isinstance(observation, str)
    assert observations == [(uuid.UUID(observation),)]


@pytest.mark.parametrize('invalid', ['expired', 'future_messages', 'future_activity', 'foreign_tenant'])
async def test_retained_invalid_observation_cannot_acknowledge(client, references, invalid):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    from app.models.conversation_read_observation import ConversationReadObservation
    values = {
        'expired': {'expires_at': datetime.now(timezone.utc)-timedelta(seconds=1)},
        'future_messages': {'message_generation': 1000},
        'future_activity': {'activity_generation': 1000},
        'foreign_tenant': {'service_center_id': refs['foreign_center']},
    }[invalid]
    async with async_session_factory() as session:
        await session.execute(update(ConversationReadObservation).where(
            ConversationReadObservation.id == uuid.UUID(observation)).values(**values))
        await session.commit()
    response = await acknowledge(client, refs, target, observation, status='resolved')
    assert response.status_code == 422
    assert await counters(target) == (1, 0)
    async with async_session_factory() as session:
        row = await session.get(Conversation, uuid.UUID(target))
        assert row.status == 'open'


@pytest.mark.parametrize('operation', ['observe', 'acknowledge'])
async def test_failed_read_transaction_has_no_success_or_partial_effect(client, references, monkeypatch, operation):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    from app.models.conversation_read_observation import ConversationReadObservation

    async def read():
        async with async_session_factory() as session:
            row = await session.get(Conversation, uuid.UUID(target))
            ids = tuple(await session.scalars(select(ConversationReadObservation.id).where(
                ConversationReadObservation.conversation_id == row.id).order_by(ConversationReadObservation.id)))
            return row.unread_messages, row.unread_activity, ids

    async def failed_commit(uow):
        raise RuntimeError('Controlled observation transaction precommit failure')

    before, events = await read(), []
    request = Operation('inbox-read-'+operation, 'GET' if operation == 'observe' else 'PATCH',
        f'/api/v1/conversations/{target}', refs['admin'],
        None if operation == 'observe' else {'mark_read': True, 'read_observation': observation}, read, 200)
    observations, statuses = [], []
    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, 'commit', failed_commit)
        patch.setattr(event_bus, 'dispatch', events.append)
        response = await send_observed(request, observations, statuses)
    assert response.status_code == 500 and statuses == [500]
    assert not observations and not events and await read() == before


async def expired_fixture(refs, target, actor_id, *, count=205):
    async with async_session_factory() as session:
        now = await session.scalar(select(func.clock_timestamp()))
        expired = [ConversationReadObservation(service_center_id=refs['center'], conversation_id=uuid.UUID(target),
            actor_id=actor_id, message_generation=0, activity_generation=0, expires_at=now-timedelta(days=1))
            for _ in range(count)]
        foreign = Conversation(service_center_id=refs['foreign_center'], subject='Other tenant observation history')
        session.add(foreign)
        await session.flush()
        other_rows = [ConversationReadObservation(service_center_id=refs['foreign_center'], conversation_id=foreign.id,
            actor_id=uuid.UUID(refs['ids'][2]), message_generation=0, activity_generation=0, expires_at=now-timedelta(days=1))
            for _ in range(105)]
        retained = ConversationReadObservation(service_center_id=refs['center'], conversation_id=uuid.UUID(target),
            actor_id=actor_id, message_generation=0, activity_generation=0, expires_at=now+timedelta(hours=1))
        session.add_all([*expired, *other_rows, retained])
        await session.commit()
        return {row.id for row in expired}, {row.id for row in other_rows}, retained.id


async def retained_ids():
    async with async_session_factory() as session:
        return set(await session.scalars(select(ConversationReadObservation.id)))


async def test_issuance_prunes_at_most100_expired_local_observations(client, references, identity):
    refs = references
    target = await create(client, refs)
    expired, foreign, retained = await expired_fixture(refs, target, identity['user'])
    _, current = await observe(client, refs, target)
    after = await retained_ids()
    assert len(expired & after) == 105 and foreign <= after and retained in after and uuid.UUID(current) in after


async def test_expired_pruning_skips_other_transactions_locked_rows(client, references, identity):
    refs = references
    target = await create(client, refs)
    expired, foreign, retained = await expired_fixture(refs, target, identity['user'])
    locked = set(sorted(expired)[:7])
    async with async_session_factory() as blocker:
        await blocker.scalars(select(ConversationReadObservation).where(
            ConversationReadObservation.id.in_(locked)).with_for_update())
        try:
            # A blocking DELETE instead of SKIP LOCKED cannot finish here.
            _, current = await asyncio.wait_for(observe(client, refs, target), timeout=5)
            after = await retained_ids()
            assert locked <= after and len(expired & after) == 105
            assert foreign <= after and retained in after and uuid.UUID(current) in after
        finally:
            await blocker.rollback()


async def test_operator_maintenance_is_bounded_to_explicit_tenant_and_batch_limit(client, references, identity):
    refs = references
    target = await create(client, refs)
    expired, foreign, retained = await expired_fixture(refs, target, identity['user'])
    async def run(*args):
        process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'app.maintenance.conversation_observations',
            *args, cwd=Path(__file__).resolve().parents[1], stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            output, _ = await asyncio.wait_for(process.communicate(), timeout=30)
        except BaseException:
            if process.returncode is None:
                process.kill()
            await process.wait()
            raise
        return process.returncode, output.decode('utf-8')
    for invalid in ['0', '101']:
        code, _ = await run('--service-center', str(refs['center']), '--max-batches', invalid)
        assert code == 2 and expired | foreign <= await retained_ids()
    code, output = await run('--service-center', str(refs['center']), '--max-batches', '2')
    assert code == 0 and 'Removed 200 expired observations' in output
    after = await retained_ids()
    assert len(expired & after) == 5 and foreign <= after and retained in after


@pytest.mark.parametrize('invalid', [
    {'message_generation': -1}, {'activity_generation': -1},
    {'acknowledged_message_generation': 2}, {'acknowledged_activity_generation': 1},
    {'unread_messages': 0}, {'unread_activity': 1},
])
async def test_database_rejects_inconsistent_shared_generation_state(client, references, invalid):
    target = await create(client, references)
    await incoming(client, references, target)
    async with async_session_factory() as session:
        with pytest.raises(IntegrityError):
            await session.execute(update(Conversation).where(Conversation.id == uuid.UUID(target)).values(**invalid))
        await session.rollback()
    assert await counters(target) == (1, 0)


async def test_first_case_read_observation_is_committed_before_success(client, references, identity):
    refs = references
    case = await open_case(client, refs)

    async def read():
        async with async_session_factory() as session:
            return tuple(await session.scalars(select(ConversationReadObservation.id).join(Conversation,
                Conversation.id == ConversationReadObservation.conversation_id).where(
                    Conversation.case_id == uuid.UUID(case), ConversationReadObservation.service_center_id == refs['center'],
                    ConversationReadObservation.actor_id == identity['user'])))

    request = Operation('case-observation-first-send', 'GET', f'/api/v1/cases/{case}/conversation', refs['admin'], None, read)
    observations, statuses = [], []
    response = await send_observed(request, observations, statuses)
    assert response.status_code == 200 and statuses == [200]
    observation = response.json()['read_observation']
    assert observations == [(uuid.UUID(observation),)]
    await incoming(client, refs, response.json()['id'])
    assert (await acknowledge(client, refs, response.json()['id'], observation)).status_code == 200
    assert await counters(response.json()['id']) == (1, 0)


async def test_case_observation_matches_history_under_overlapping_arrivals(client, references):
    refs = references
    case = await open_case(client, refs)
    initial = await client.get(f'/api/v1/cases/{case}/conversation', headers=refs['admin'])
    assert initial.status_code == 200
    target = initial.json()['id']
    first = await incoming(client, refs, target, 'Earlier case reply')
    async with async_session_factory() as blocker:
        await blocker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target)).with_for_update())
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        read = asyncio.create_task(client.get(f'/api/v1/cases/{case}/conversation', headers=refs['admin']))
        arrivals = [asyncio.create_task(incoming(client, refs, target, 'Racing case reply '+str(i))) for i in range(3)]
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 4)
            assert not any(task.done() for task in [read, *arrivals])
        finally:
            await blocker.rollback()
            results = await drain_requests([read, *arrivals])
    assert not any(isinstance(result, BaseException) for result in results)
    observed = results[0].json()
    seen = {message['id'] for message in observed['messages']} & {first, *results[1:]}
    assert results[0].status_code == 200 and observed['id'] == target and first in seen
    assert (await acknowledge(client, refs, target, observed['read_observation'])).status_code == 200
    assert await counters(target) == (4-len(seen), 0)


async def test_normal_mini_arrival_survives_old_staff_observation_and_customer_read_issues_none(client, target):
    path = f"/api/v1/customer/messages/{target['id']}"
    async def send(body):
        response = await client.post(path, headers={**target['customer'], 'Idempotency-Key': str(uuid.uuid4())}, json={'body': body})
        assert response.status_code == 200, response.text
        return response.json()['id']
    await send('Observed Mini reply')
    staff = await client.get(f"/api/v1/conversations/{target['id']}", headers=target['staff'])
    assert staff.status_code == 200
    observation = staff.json()['read_observation']
    customer = await client.get(path, headers=target['customer'])
    assert customer.status_code == 200 and 'read_observation' not in customer.json()
    async with UnitOfWork(service_center_id=target['center']) as uow:
        from app.services.conversation_service import ConversationService
        internal = await ConversationService(uow).get_thread(uuid.UUID(target['id']))
        assert 'read_observation' not in internal
    async with async_session_factory() as session:
        assert tuple(await session.scalars(select(ConversationReadObservation.id).where(
            ConversationReadObservation.conversation_id == uuid.UUID(target['id'])))) == (uuid.UUID(observation),)
    newer = await send('Unseen Mini reply')
    response = await client.patch(f"/api/v1/conversations/{target['id']}", headers=target['staff'],
        json={'mark_read': True, 'read_observation': observation})
    assert response.status_code == 200 and await counters(target['id']) == (1, 0)
    history = (await client.get(path, headers=target['customer'])).json()
    assert newer in {message['id'] for message in history['messages']}


@pytest.mark.parametrize('entry', ['inbox', 'case'])
async def test_demo_read_observation_does_not_expand_write_permission(client, references, identity, monkeypatch, entry):
    from app.core.config import settings
    refs = references
    if entry == 'case':
        case = await open_case(client, refs)
        path = f'/api/v1/cases/{case}/conversation'
        existing = await client.get(path, headers=refs['admin'])
        assert existing.status_code == 200
        target = existing.json()['id']
    else:
        target = await create(client, refs)
        path = f'/api/v1/conversations/{target}'
    await incoming(client, refs, target)
    monkeypatch.setattr(settings, 'DEMO_MODE_ENABLED', True)
    monkeypatch.setattr(settings, 'DEMO_EMAIL', identity['email'])
    login = await client.post('/api/v1/auth/demo')
    assert login.status_code == 200
    headers = {'Authorization': 'Bearer '+login.json()['access_token']}
    observed = await client.get(path, headers=headers)
    assert observed.status_code == 200 and isinstance(observed.json()['read_observation'], str)
    denied = await client.patch(f'/api/v1/conversations/{target}', headers=headers,
        json={'mark_read': True, 'read_observation': observed.json()['read_observation']})
    assert denied.status_code == 403 and await counters(target) == (1, 0)


async def test_observation_expiring_while_its_lock_waits_is_rejected(client, references):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as session:
        expires = await session.scalar(select(func.clock_timestamp())) + timedelta(seconds=5)
        await session.execute(update(ConversationReadObservation).where(
            ConversationReadObservation.id == uuid.UUID(observation)).values(expires_at=expires))
        await session.commit()
    async with async_session_factory() as blocker:
        await blocker.scalar(select(ConversationReadObservation).where(
            ConversationReadObservation.id == uuid.UUID(observation)).with_for_update())
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        pending = asyncio.create_task(acknowledge(client, refs, target, observation, status='resolved'))
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 1)
            assert not pending.done()
            async with asyncio.timeout(10):
                while True:
                    async with async_session_factory() as observer:
                        if await observer.scalar(select(func.clock_timestamp())) >= expires:
                            break
                    await asyncio.sleep(.02)
        finally:
            await blocker.rollback()
            results = await drain_requests([pending])
    assert not isinstance(results[0], BaseException) and results[0].status_code == 422
    assert await counters(target) == (1, 0)
    async with async_session_factory() as session:
        assert (await session.get(Conversation, uuid.UUID(target))).status == 'open'


@pytest.mark.parametrize('operation', ['observe', 'acknowledge', 'status'])
async def test_foreign_child_committed_during_parent_fk_lock_wait_is_denied(client, references, operation):
    refs = references
    target = await create(client, refs)
    await incoming(client, refs, target)
    _, observation = await observe(client, refs, target)
    async with async_session_factory() as blocker:
        blocker.add(Participant(service_center_id=refs['foreign_center'], conversation_id=uuid.UUID(target),
            display_name='FOREIGN-PENDING-CHILD', role='watcher'))
        await blocker.flush()  # real FK key-share lock; no disabled constraints
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        path = f'/api/v1/conversations/{target}'
        request = client.get(path, headers=refs['admin']) if operation == 'observe' else client.patch(
            path, headers=refs['admin'], json={'mark_read': True, 'read_observation': observation}
            if operation == 'acknowledge' else {'status': 'resolved'})
        pending = asyncio.create_task(request)
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 1)
            assert not pending.done()
        finally:
            try:
                await blocker.commit()
            finally:
                if blocker.in_transaction():
                    await blocker.rollback()
                results = await drain_requests([pending])
    assert not isinstance(results[0], BaseException) and results[0].status_code == 404
    assert 'FOREIGN-PENDING-CHILD' not in results[0].text and await counters(target) == (1, 0)
    async with async_session_factory() as session:
        assert (await session.get(Conversation, uuid.UUID(target))).status == 'open'
        assert tuple(await session.scalars(select(ConversationReadObservation.id).where(
            ConversationReadObservation.conversation_id == uuid.UUID(target)))) == (uuid.UUID(observation),)


@pytest.mark.parametrize('actor', ['staff', 'customer'])
@pytest.mark.parametrize('keyed', [False, True])
async def test_incoming_producer_rechecks_nested_owner_changed_during_aggregate_lock_wait(client, target, references, monkeypatch, actor, keyed):
    from app.models import MessageIntent, Vehicle
    from app.models.conversation import Message
    events = []
    monkeypatch.setattr(event_bus, 'dispatch', events.append)
    async with async_session_factory() as session:
        vehicle = Vehicle(service_center_id=target['center'], customer_id=uuid.UUID(target['customer_id']),
                          vehicle_model_id=uuid.UUID(references['model']), year=2024)
        session.add(vehicle)
        await session.flush()
        await session.execute(update(Conversation).where(Conversation.id == uuid.UUID(target['id'])).values(vehicle_id=vehicle.id))
        vehicle_id = vehicle.id
        await session.commit()
    path = (f"/api/v1/conversations/{target['id']}/messages" if actor == 'staff'
            else f"/api/v1/customer/messages/{target['id']}")
    headers = {**target[actor], **({'Idempotency-Key': str(uuid.uuid4())} if keyed else {})}
    async with async_session_factory() as blocker:
        await blocker.scalar(select(Conversation).where(Conversation.id == uuid.UUID(target['id'])).with_for_update())
        blocker_pid = await blocker.scalar(text('SELECT pg_backend_pid()'))
        pending = asyncio.create_task(client.post(path, headers=headers, json={'body': 'Must not enter unsafe thread'}))
        try:
            await wait_for_owned_lock_waiters(blocker_pid, 1)
            assert not pending.done()
            async with async_session_factory() as writer:
                await writer.execute(update(Vehicle).where(Vehicle.id == vehicle_id).values(customer_id=uuid.UUID(references['foreign_customer'])))
                await writer.commit()
        finally:
            await blocker.rollback()
            results = await drain_requests([pending])
    async with async_session_factory() as session:
        stored = tuple([await session.scalar(select(func.count()).select_from(model).where(
            model.conversation_id == uuid.UUID(target['id']))) for model in [Message, MessageIntent]])
    assert not isinstance(results[0], BaseException)
    actual = (results[0].status_code, await counters(target['id']), stored, len(events))
    assert actual == (404, (0, 0), (0, 0), 0)


async def test_no_expired_ledger_uses_expiry_index_range_without_scanning_live_observations(client, references, identity, record_testsuite_property):
    import json
    from sqlalchemy import event
    from app.core.database import engine
    target = await create(client, references)
    async with async_session_factory() as session:
        await session.execute(text('''
            INSERT INTO conversation_read_observations
                (id,service_center_id,conversation_id,actor_id,message_generation,activity_generation,expires_at,is_active)
            SELECT gen_random_uuid(),:center,:conversation,:actor,0,0,clock_timestamp()+interval '24 hours',true
            FROM generate_series(1,5000)
        '''), {'center': references['center'], 'conversation': uuid.UUID(target), 'actor': identity['user']})
        await session.execute(text('ANALYZE conversation_read_observations'))
        await session.commit()
    captured = []
    def record(connection, cursor, statement, parameters, context, executemany):
        if 'DELETE FROM conversation_read_observations' in statement:
            captured.append((statement, parameters))
    event.listen(engine.sync_engine, 'before_cursor_execute', record)
    try:
        await observe(client, references, target)
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', record)
    assert len(captured) == 1
    statement, parameters = captured[0]
    async with async_session_factory() as session:
        connection = await session.connection()
        raw = (await connection.get_raw_connection()).driver_connection
        report = await raw.fetchval('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + statement, *parameters)
        if isinstance(report, str):
            report = json.loads(report)
        # This is the actual production DELETE with its original bind values,
        # not a hand-written alternate query or a disabled sequential scan.
        def nodes(node):
            yield node
            for child in node.get('Plans', []):
                yield from nodes(child)
        plan = list(nodes(report[0]['Plan']))
        expiry = [node for node in plan if node.get('Index Name') == 'ix_conversation_observation_expiry']
        assert any('expires_at' in node.get('Index Cond', '') for node in expiry), report
        assert sum(node.get('Rows Removed by Filter', 0) for node in plan) == 0, report
        record_testsuite_property('observed_read_prune_5000_live_actual_plan', json.dumps(report))
        assert await session.scalar(select(func.count()).select_from(ConversationReadObservation).where(
            ConversationReadObservation.conversation_id == uuid.UUID(target))) == 5001
