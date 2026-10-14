"""Session security through normal HTTP and independent PostgreSQL observations."""
import asyncio
import uuid
from datetime import datetime, timezone

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.security import create_access_token, decode_token
from app.main import app
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401
from tests.test_staff_management_api import employee_data, owner  # noqa: F401


@pytest_asyncio.fixture(params=["staff", "customer"])
async def principal(request, client, identity, owner):
    if request.param == "staff":
        return {"auth": "/api/v1/auth", "me": "/api/v1/auth/me",
                "id": str(identity["user"]), "email": identity["email"], "kind": "staff"}
    customer = await client.post("/api/v1/customers", headers=owner, json={
        "full_name": "Session customer", "phone": "998" + str(uuid.uuid4().int)[:9]})
    assert customer.status_code == 201
    email = f"session-{uuid.uuid4().hex}@example.com"
    opened = await client.post(f"/api/v1/customers/{customer.json()['id']}/account", headers=owner,
                              json={"email": email, "password": PASSWORD})
    assert opened.status_code == 201
    return {"auth": "/api/v1/customer/auth", "me": "/api/v1/customer/me",
            "id": customer.json()["id"], "email": email, "kind": "customer"}


async def sign_in(client, principal):
    response = await client.post(principal["auth"] + "/login",
                                 json={"email": principal["email"], "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()


def bearer(tokens):
    return {"Authorization": "Bearer " + tokens["access_token"]}


async def test_session_is_persisted_and_only_refresh_digest_is_stored(client, principal, identity):
    tokens = await sign_in(client, principal)
    access, refresh = map(decode_token, (tokens["access_token"], tokens["refresh_token"]))
    assert uuid.UUID(access["sid"]) == uuid.UUID(refresh["sid"])
    assert uuid.UUID(refresh["jti"])
    from app.models.auth_session import AuthSession
    async with async_session_factory() as session:
        saved = await session.get(AuthSession, uuid.UUID(access["sid"]))
        assert saved.principal_kind == principal["kind"]
        assert saved.service_center_id == identity["center"]
        assert saved.refresh_digest != tokens["refresh_token"]
        assert len(saved.refresh_digest) == 64
        assert saved.revoked_at is None
        assert abs(saved.expires_at.timestamp() - refresh["exp"]) < 1


async def test_refresh_rotates_and_replay_durably_revokes_new_pair(client, principal):
    first = await sign_in(client, principal)
    changed = await client.post(principal["auth"] + "/refresh", json={"refresh_token": first["refresh_token"]})
    assert changed.status_code == 200, changed.text
    second = changed.json()
    assert bool(first["refresh_token"] != second["refresh_token"])
    assert decode_token(first["refresh_token"])["sid"] == decode_token(second["refresh_token"])["sid"]
    assert decode_token(first["refresh_token"])["exp"] == decode_token(second["refresh_token"])["exp"]
    assert (await client.get(principal["me"], headers=bearer(second))).status_code == 200
    replay = await client.post(principal["auth"] + "/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401
    assert (await client.get(principal["me"], headers=bearer(second))).status_code == 401
    assert (await client.post(principal["auth"] + "/refresh", json={"refresh_token": second["refresh_token"]})).status_code == 401
    from app.models.auth_session import AuthSession
    async with async_session_factory() as session:
        saved = await session.get(AuthSession, uuid.UUID(decode_token(second["access_token"])["sid"]))
        assert saved.revoked_at is not None


async def test_parallel_refresh_has_one_winner_and_replay_revokes_family(client, principal):
    tokens = await sign_in(client, principal)
    results = await asyncio.gather(*(client.post(principal["auth"] + "/refresh",
        json={"refresh_token": tokens["refresh_token"]}) for _ in range(2)))
    assert sorted(r.status_code for r in results) == [200, 401]
    winner = next(r.json() for r in results if r.status_code == 200)
    assert (await client.get(principal["me"], headers=bearer(winner))).status_code == 401


@pytest.mark.parametrize("proof", ["access", "refresh"])
async def test_logout_is_idempotent_and_revokes_both_token_types(client, principal, proof):
    tokens = await sign_in(client, principal)
    options = {"headers": bearer(tokens)} if proof == "access" else {"json": {"refresh_token": tokens["refresh_token"]}}
    for _ in range(2):
        response = await client.post(principal["auth"] + "/logout", **options)
        assert response.status_code == 200 and response.json() == {"ok": True}
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 401
    assert (await client.post(principal["auth"] + "/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401


async def test_logout_bad_bearer_never_falls_back_to_valid_refresh(client, principal):
    tokens = await sign_in(client, principal)
    response = await client.post(principal["auth"] + "/logout", headers={"Authorization": "Bearer broken"},
                                 json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


async def test_legacy_sessionless_access_requires_relogin(client, principal):
    kind = "access" if principal["kind"] == "staff" else "customer_access"
    old = create_access_token({"sub": principal["id"], "type": kind})
    assert (await client.get(principal["me"], headers={"Authorization": "Bearer " + old})).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(await sign_in(client, principal)))).status_code == 200


async def test_session_cannot_be_used_under_forged_other_subject(client, principal):
    tokens = await sign_in(client, principal)
    claims = decode_token(tokens["access_token"])
    claims["sub"] = str(uuid.uuid4())
    forged = create_access_token(claims)
    assert (await client.post(principal["auth"] + "/logout", headers={"Authorization": "Bearer " + forged})).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


async def test_logout_missing_or_expired_proof_is_rejected(client, principal):
    tokens = await sign_in(client, principal)
    assert (await client.post(principal["auth"] + "/logout")).status_code == 401
    claims = decode_token(tokens["access_token"])
    import jwt
    from app.core.config import settings
    claims["exp"] = 1
    expired = jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await client.post(principal["auth"] + "/logout", headers={"Authorization": "Bearer " + expired})).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


async def test_logout_proof_types_do_not_cross_staff_customer_boundary(client, principal):
    tokens = await sign_in(client, principal)
    other = "/api/v1/customer/auth" if principal["kind"] == "staff" else "/api/v1/auth"
    assert (await client.post(other + "/logout", headers=bearer(tokens))).status_code == 401
    assert (await client.post(other + "/logout", json={"refresh_token": tokens["refresh_token"]})).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


@pytest.mark.parametrize("changed", ["scid", "demo", "account_id", "account_version", "jti"])
async def test_altered_signed_refresh_binding_is_denied_without_revoking_valid_family(client, principal, changed):
    import jwt
    from app.core.config import settings
    tokens = await sign_in(client, principal)
    claims = decode_token(tokens["refresh_token"])
    replacement = {"scid": str(uuid.uuid4()), "demo": True, "account_id": str(uuid.uuid4()),
                   "account_version": 987654, "jti": "not-a-uuid"}
    claims[changed] = replacement[changed]
    malformed = jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await client.post(principal["auth"] + "/refresh", json={"refresh_token": malformed})).status_code == 401
    assert (await client.post(principal["auth"] + "/logout", json={"refresh_token": malformed})).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200
    assert (await client.post(principal["auth"] + "/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 200


async def test_password_customer_cannot_remove_account_claims_to_gain_telegram_policy(client, identity, owner):
    import jwt
    from app.core.config import settings
    created = await client.post("/api/v1/customers", headers=owner, json={
        "full_name": "Bound password identity", "phone": "998" + str(uuid.uuid4().int)[:9]})
    assert created.status_code == 201
    email = f"account-binding-{uuid.uuid4().hex}@example.com"
    opened = await client.post(f"/api/v1/customers/{created.json()['id']}/account", headers=owner,
                              json={"email": email, "password": PASSWORD})
    assert opened.status_code == 201
    principal = {"auth": "/api/v1/customer/auth", "me": "/api/v1/customer/me", "email": email}
    tokens = await sign_in(client, principal)
    claims = decode_token(tokens["access_token"])
    claims.pop("account_id")
    claims.pop("account_version")
    altered = jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await client.get("/api/v1/customer/billing", headers={"Authorization": "Bearer " + altered})).status_code == 401
    assert (await client.get("/api/v1/customer/billing", headers=bearer(tokens))).status_code == 403
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


async def test_suspended_employee_reactivation_does_not_restore_old_session(client, identity, owner):
    data = employee_data()
    created = await client.post("/api/v1/staff", headers=owner, json=data)
    assert created.status_code == 201
    principal = {"auth": "/api/v1/auth", "me": "/api/v1/auth/me", "email": data["email"]}
    tokens = await sign_in(client, principal)
    for active in (False, True):
        changed = await client.patch(f"/api/v1/staff/{created.json()['id']}", headers=owner, json={"is_active": active})
        assert changed.status_code == 200
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 401
    assert (await client.get(principal["me"], headers=bearer(await sign_in(client, principal)))).status_code == 200


async def test_suspended_principal_can_logout_and_reactivation_cannot_restore_session(client, principal, identity, owner):
    tokens = await sign_in(client, principal)
    if principal["kind"] == "staff":
        from sqlalchemy import update
        from app.models.user import User
        async with async_session_factory() as session:
            await session.execute(update(User).where(User.id == identity["user"]).values(is_active=False))
            await session.commit()
    else:
        changed = await client.patch(f"/api/v1/customers/{principal['id']}/account", headers=owner,
                                     json={"is_active": False})
        assert changed.status_code == 200
    assert (await client.post(principal["auth"] + "/logout", headers=bearer(tokens))).status_code == 200
    from app.models.auth_session import AuthSession
    async with async_session_factory() as session:
        saved = await session.get(AuthSession, uuid.UUID(decode_token(tokens["access_token"])["sid"]))
        assert saved.revoked_at is not None


async def test_session_committed_before_first_http_success(client, principal):
    from app.models.auth_session import AuthSession
    observed = []
    principal_column = AuthSession.user_id if principal["kind"] == "staff" else AuthSession.customer_id
    async with async_session_factory() as session:
        before = set(await session.scalars(select(AuthSession.id).where(
            principal_column == uuid.UUID(principal["id"]))))
    async def watched_app(scope, receive, send):
        async def watched(message):
            if message["type"] == "http.response.start" and message["status"] == 200:
                async with async_session_factory() as session:
                    saved = set(await session.scalars(select(AuthSession.id).where(
                        principal_column == uuid.UUID(principal["id"]))))
                    observed.append(bool(saved - before))
            await send(message)
        await app(scope, receive, watched)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=watched_app), base_url="http://test") as watched:
        tokens = await sign_in(watched, principal)
    assert observed == [True]
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200


async def test_failed_session_commit_never_sends_login_success(client, principal, monkeypatch):
    from app.models.auth_session import AuthSession
    original = AsyncSession.commit
    async def fail_session_commit(session):
        if any(isinstance(row, AuthSession) for row in list(session.new | session.dirty) + list(session.identity_map.values())):
            raise RuntimeError("injected session commit failure")
        return await original(session)
    monkeypatch.setattr(AsyncSession, "commit", fail_session_commit)
    response = await client.post(principal["auth"] + "/login", json={"email": principal["email"], "password": PASSWORD})
    assert response.status_code == 500


@pytest.mark.parametrize("operation", ["refresh", "logout"])
async def test_refresh_and_logout_are_durable_at_first_success(client, principal, operation):
    from app.models.auth_session import AuthSession
    tokens = await sign_in(client, principal)
    sid = uuid.UUID(decode_token(tokens["access_token"])["sid"])
    async with async_session_factory() as session:
        original_digest = (await session.get(AuthSession, sid)).refresh_digest
    observations = []
    async def watched_app(scope, receive, send):
        async def watched(message):
            if message["type"] == "http.response.start" and message["status"] == 200:
                async with async_session_factory() as session:
                    saved = await session.get(AuthSession, sid)
                    observations.append(saved.revoked_at is not None if operation == "logout"
                                        else saved.refresh_digest != original_digest)
            await send(message)
        await app(scope, receive, watched)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=watched_app), base_url="http://test") as watched:
        response = await watched.post(principal["auth"] + "/" + operation,
                                      json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    assert observations == [True]


@pytest.mark.parametrize("operation", ["refresh", "logout"])
async def test_failed_rotation_or_logout_commit_never_sends_success(client, principal, operation, monkeypatch):
    from app.models.auth_session import AuthSession
    tokens = await sign_in(client, principal)
    original = AsyncSession.commit
    async def fail_session_commit(session):
        if any(isinstance(row, AuthSession) for row in session.dirty):
            raise RuntimeError("injected session commit failure")
        return await original(session)
    with monkeypatch.context() as fault:
        fault.setattr(AsyncSession, "commit", fail_session_commit)
        response = await client.post(principal["auth"] + "/" + operation,
                                      json={"refresh_token": tokens["refresh_token"]})
        assert response.status_code == 500
    # Failed commit rolls the mutation back, leaving the prior family usable.
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 200
    changed = await client.post(principal["auth"] + "/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert changed.status_code == 200


async def test_session_expiry_cannot_be_extended_by_valid_access(client, principal):
    tokens = await sign_in(client, principal)
    from app.models.auth_session import AuthSession
    async with async_session_factory() as session:
        saved = await session.get(AuthSession, uuid.UUID(decode_token(tokens["access_token"])["sid"]))
        saved.expires_at = datetime(2000, 1, 1, tzinfo=timezone.utc)
        await session.commit()
    assert (await client.get(principal["me"], headers=bearer(tokens))).status_code == 401
    assert (await client.post(principal["auth"] + "/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401
