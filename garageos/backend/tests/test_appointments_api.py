"""Integration tests for the appointment read API (Sprint 3 Phase 1).

Requires the demo database to be seeded (``python -m app.seeds.demo``): they log
in as the seeded primary-tenant admin and assert tenant-scoped behavior against
real data — including the key regression: a cross-tenant fetch returns 404, not
403, so resource existence never leaks.
"""
from __future__ import annotations

import httpx
import pytest_asyncio
from sqlalchemy import func, select

from app.core.database import async_session_factory, engine
from app.main import app
from app.models import Appointment, ServiceCenter

PRIMARY_ADMIN = ("admin@demo.garageos.app", "parol12345")
PRIMARY_EMAIL = "demo@garageos.app"
TENANT_B_EMAIL = "northside@garageos.app"


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine():
    # pytest-asyncio runs each test on its own loop; dispose the app's pooled
    # engine on teardown so the next test opens fresh, correctly-bound connections.
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _login(client: httpx.AsyncClient, email: str, password: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_login_and_me(client):
    token = await _login(client, *PRIMARY_ADMIN)
    resp = await client.get("/api/v1/auth/me", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == PRIMARY_ADMIN[0]
    assert body["service_center_id"]


async def test_unauthenticated_is_401(client):
    resp = await client.get("/api/v1/appointments")
    assert resp.status_code == 401


async def test_list_is_scoped_to_tenant(client):
    token = await _login(client, *PRIMARY_ADMIN)
    # Derive the expected count from the DB so the test isn't tied to exact seed
    # volume, and assert the tenant is a strict subset of all appointments.
    async with async_session_factory() as s:
        a_center = (await s.execute(
            select(ServiceCenter).where(ServiceCenter.email == PRIMARY_EMAIL)
        )).scalar_one()
        a_count = (await s.execute(
            select(func.count()).select_from(Appointment)
            .where(Appointment.service_center_id == a_center.id, Appointment.is_active == True)
        )).scalar_one()
        global_count = (await s.execute(
            select(func.count()).select_from(Appointment).where(Appointment.is_active == True)
        )).scalar_one()

    resp = await client.get("/api/v1/appointments?page_size=100", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == a_count
    assert 0 < a_count < global_count  # scoping: strict subset of all tenants' data


async def test_stats_shape(client):
    token = await _login(client, *PRIMARY_ADMIN)
    resp = await client.get("/api/v1/appointments/stats", headers=_auth(token))
    assert resp.status_code == 200
    stats = resp.json()
    for key in ("today_count", "pending_count", "confirmed_count", "completed_count", "cancelled_count"):
        assert key in stats


async def test_cross_tenant_get_returns_404_not_403(client):
    """The core regression: tenant A requesting tenant B's appointment id must
    get 404 (existence not leaked), and never 403."""
    token = await _login(client, *PRIMARY_ADMIN)  # tenant A

    async with async_session_factory() as s:
        b_center = (await s.execute(
            select(ServiceCenter).where(ServiceCenter.email == TENANT_B_EMAIL)
        )).scalar_one()
        a_center = (await s.execute(
            select(ServiceCenter).where(ServiceCenter.email == PRIMARY_EMAIL)
        )).scalar_one()
        b_appt_id = str((await s.execute(
            select(Appointment.id).where(Appointment.service_center_id == b_center.id).limit(1)
        )).scalar_one())
        a_appt_id = str((await s.execute(
            select(Appointment.id).where(Appointment.service_center_id == a_center.id).limit(1)
        )).scalar_one())

    # Cross-tenant -> 404 (NOT 403)
    cross = await client.get(f"/api/v1/appointments/{b_appt_id}", headers=_auth(token))
    assert cross.status_code == 404, cross.text

    # Own tenant -> 200
    own = await client.get(f"/api/v1/appointments/{a_appt_id}", headers=_auth(token))
    assert own.status_code == 200
    assert own.json()["id"] == a_appt_id
