"""Authentication must stop when a garage or staff role is suspended."""
from __future__ import annotations

import uuid

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select, update

from app.core.database import async_session_factory, engine
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, hash_password
from tests.support.auth_sessions import persisted_access, persisted_pair
from app.main import app
from app.models import Role, ServiceCenter, User

PASSWORD = "Readiness-test-only-2026!"


@pytest_asyncio.fixture
async def identity():
    tag = uuid.uuid4().hex
    async with async_session_factory() as session:
        center = ServiceCenter(name=f"Readiness {tag}")
        role = Role(name=f"readiness-{tag}")
        session.add_all([center, role])
        await session.flush()
        user = User(
            service_center_id=center.id, role_id=role.id,
            email=f"readiness-{tag}@example.com", full_name="Readiness xodim",
            password_hash=hash_password(PASSWORD), is_super_admin=False,
        )
        session.add(user)
        await session.commit()
        ids = {"center": center.id, "role": role.id, "user": user.id, "email": user.email}
    try:
        yield ids
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(User).where(User.id == ids["user"]))
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == ids["center"]))
            await session.execute(delete(Role).where(Role.id == ids["role"]))
            await session.commit()
        await engine.dispose()


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        yield client


async def _suspend(identity, kind):
    model, key = {"center": (ServiceCenter, "center"), "role": (Role, "role"), "user": (User, "user")}[kind]
    async with async_session_factory() as session:
        await session.execute(update(model).where(model.id == identity[key]).values(is_active=False))
        await session.commit()


async def _as_role(identity, name):
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == name))
        if role is None:
            role = Role(name=name)
            session.add(role)
            await session.flush()
        await session.execute(update(User).where(User.id == identity["user"]).values(role_id=role.id))
        await session.commit()


@pytest.mark.parametrize("kind", ["center", "role", "user"])
async def test_suspended_staff_identity_cannot_sign_in(client, identity, kind):
    await _suspend(identity, kind)
    response = await client.post("/api/v1/auth/login", json={"email": identity["email"], "password": PASSWORD})
    assert response.status_code == 401, response.text
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.parametrize("kind", ["center", "role", "user"])
@pytest.mark.parametrize("operation", ["access", "refresh"])
async def test_suspension_revokes_existing_staff_tokens(client, identity, kind, operation):
    payload = {"sub": str(identity["user"]), "type": operation}
    pair = await persisted_pair(payload)
    token = pair[operation + "_token"]
    await _suspend(identity, kind)
    if operation == "access":
        response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    else:
        response = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


async def test_active_staff_login_profile_and_refresh_still_work(client, identity):
    login = await client.post("/api/v1/auth/login", json={"email": identity["email"], "password": PASSWORD})
    assert login.status_code == 200
    tokens = login.json()
    profile = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert profile.status_code == 200
    assert profile.json()["id"] == str(identity["user"])
    assert profile.json()["service_center_id"] == str(identity["center"])
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    profile = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"})
    assert profile.status_code == 200
    assert profile.json()["id"] == str(identity["user"])


async def test_mechanic_cannot_read_intake_or_create_customer(client, identity):
    await _as_role(identity, "mechanic")
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}
    listed = await client.get("/api/v1/customers", headers=headers)
    assert listed.status_code == 403
    response = await client.post("/api/v1/customers", headers=headers, json={"full_name": "Unauthorized intake", "phone": "+998900000001"})
    assert response.status_code == 403


@pytest.mark.parametrize("role", ["admin", "manager", "receptionist", "super_admin"])
async def test_operator_roles_can_run_intake_with_advertised_permissions(client, identity, role):
    await _as_role(identity, role)
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}
    profile = await client.get("/api/v1/auth/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["permissions"] == ["staff.read", "staff.write"]
    response = await client.post("/api/v1/customers", headers=headers, json={"full_name": "Authorized intake", "phone": "+998900000001"})
    assert response.status_code == 201
    listed = await client.get("/api/v1/customers", headers=headers)
    assert any(customer["id"] == response.json()["id"] for customer in listed.json()["items"])


@pytest.mark.parametrize("method,path,body", [
    ("POST", "/invoices/00000000-0000-0000-0000-000000000000/payments", {"amount": 100, "method": "cash"}),
    ("PUT", "/invoices/00000000-0000-0000-0000-000000000000", {}),
    ("PATCH", "/appointments/00000000-0000-0000-0000-000000000000/start", None),
    ("DELETE", "/customers/00000000-0000-0000-0000-000000000000", None),
    ("POST", "/notifications/read-all", None),
])
async def test_mechanic_cannot_mutate_staff_routes(client, identity, method, path, body):
    await _as_role(identity, "mechanic")
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    response = await client.request(method, f"/api/v1{path}", headers={"Authorization": f"Bearer {token}"}, json=body)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


async def test_unknown_role_and_platform_flag_do_not_grant_tenant_access(client, identity):
    async with async_session_factory() as session:
        await session.execute(update(User).where(User.id == identity["user"]).values(is_super_admin=True))
        await session.commit()
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}
    profile = await client.get("/api/v1/auth/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["permissions"] == []
    assert (await client.get("/api/v1/customers", headers=headers)).status_code == 403


async def test_public_demo_advertises_read_only_even_for_operator_role(client, identity, monkeypatch):
    await _as_role(identity, "admin")
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
    login = await client.post("/api/v1/auth/demo")
    assert login.status_code == 200
    profile = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert profile.status_code == 200
    assert profile.json()["permissions"] == ["staff.read"]


async def _case_with_operator(client, identity):
    await _as_role(identity, "admin")
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}
    customer = await client.post("/api/v1/customers", headers=headers, json={"full_name": "Dispatch customer", "phone": "+998900000003"})
    assert customer.status_code == 201
    case = await client.post("/api/v1/cases", headers=headers, json={"customer_id": customer.json()["id"], "title": "Read-only conversation regression"})
    assert case.status_code == 201
    return case.json()["id"], headers


async def _readonly_headers(client, identity, mode, monkeypatch):
    if mode == "mechanic":
        await _as_role(identity, "mechanic")
        token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    else:
        monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
        monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
        login = await client.post("/api/v1/auth/demo")
        assert login.status_code == 200
        token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("mode", ["mechanic", "demo"])
async def test_readonly_case_lookup_cannot_create_a_conversation(client, identity, mode, monkeypatch):
    case_id, operator = await _case_with_operator(client, identity)
    before = await client.get("/api/v1/conversations", headers=operator)
    assert before.status_code == 200
    assert before.json()["items"] == []
    headers = await _readonly_headers(client, identity, mode, monkeypatch)
    response = await client.get(f"/api/v1/cases/{case_id}/conversation", headers=headers)
    assert response.status_code == 403
    await _as_role(identity, "admin")
    after = await client.get("/api/v1/conversations", headers=operator)
    assert after.status_code == 200
    assert after.json()["items"] == []


@pytest.mark.parametrize("mode", ["mechanic", "demo"])
async def test_operator_can_create_case_thread_and_readonly_staff_can_read_it(client, identity, mode, monkeypatch):
    case_id, operator = await _case_with_operator(client, identity)
    created = await client.get(f"/api/v1/cases/{case_id}/conversation", headers=operator)
    assert created.status_code == 200
    headers = await _readonly_headers(client, identity, mode, monkeypatch)
    existing = await client.get(f"/api/v1/cases/{case_id}/conversation", headers=headers)
    if mode == "mechanic":
        assert existing.status_code == 403
        assert (await client.get("/api/v1/conversations", headers=headers)).status_code == 403
        return
    assert existing.status_code == 200
    # Each authorized staff read records fresh observation authority, while
    # the existing thread's business history remains exactly the same.
    created_data, existing_data = created.json(), existing.json()
    observation_ids = [uuid.UUID(data.pop("read_observation")) for data in (created_data, existing_data)]
    assert observation_ids[0] != observation_ids[1]
    assert existing_data == created_data
    from app.models.conversation_read_observation import ConversationReadObservation
    async with async_session_factory() as session:
        observations = list(await session.scalars(select(ConversationReadObservation).where(
            ConversationReadObservation.id.in_(observation_ids))))
        assert {row.id for row in observations} == set(observation_ids)
        assert all(row.service_center_id == identity["center"] and row.actor_id == identity["user"]
                   and str(row.conversation_id) == created_data["id"] for row in observations)
    denied = await client.patch(f'/api/v1/conversations/{created_data["id"]}', headers=headers,
                               json={"mark_read": True, "read_observation": str(observation_ids[1])})
    assert denied.status_code == 403
    listed = await client.get("/api/v1/conversations", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [created.json()["id"]]


async def test_mechanic_cannot_lookup_unassigned_cases(client, identity):
    await _as_role(identity, "mechanic")
    token = await persisted_access({"sub": str(identity["user"]), "type": "access"})
    response = await client.get(f"/api/v1/cases/{uuid.uuid4()}/conversation", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


@pytest.mark.parametrize("kind", ["center", "role", "user"])
async def test_suspended_staff_identity_cannot_enter_public_demo(client, identity, kind, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    monkeypatch.setattr(settings, "DEMO_EMAIL", identity["email"])
    await _suspend(identity, kind)
    response = await client.post("/api/v1/auth/demo")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.parametrize("subject", ["not-a-uuid", "", str(uuid.UUID(int=0))])
@pytest.mark.parametrize("operation", ["access", "refresh"])
async def test_invalid_or_missing_token_identity_is_unauthorized(client, subject, operation):
    payload = {"sub": subject, "type": operation}
    token = create_access_token(payload) if operation == "access" else create_refresh_token(payload)
    try:
        if operation == "access":
            response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        else:
            response = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_TOKEN"
    finally:
        await engine.dispose()
