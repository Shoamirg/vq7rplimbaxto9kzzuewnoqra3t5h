"""Staff routes containing tenant-wide records are unavailable to mechanics."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.api.deps import get_current_user, get_office_staff_user, get_tenant_uow
from app.exceptions import UnauthorizedAction
from app.main import app


OFFICE_ONLY_GETS = [
    "/api/v1/appointments",
    "/api/v1/calendar",
    "/api/v1/slots",
    "/api/v1/vehicles",
    "/api/v1/customers",
    "/api/v1/search",
    "/api/v1/notifications",
    "/api/v1/cases",
    "/api/v1/cases/mechanics",
    "/api/v1/conversations",
    "/api/v1/invoices",
    "/api/v1/reports/dashboard",
    "/api/v1/fleet/health",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["admin", "manager", "receptionist"])
async def test_active_office_roles_can_use_staff_modules(role_name):
    actor = SimpleNamespace(
        is_active=True,
        role=SimpleNamespace(name=role_name, is_active=True),
    )

    assert await get_office_staff_user(actor) is actor


@pytest.mark.asyncio
async def test_super_admin_does_not_bypass_tenant_staff_role_policy():
    actor = SimpleNamespace(
        is_active=True,
        role=SimpleNamespace(name="super_admin", is_active=True),
    )

    with pytest.raises(UnauthorizedAction):
        await get_office_staff_user(actor)


@pytest.mark.asyncio
@pytest.mark.parametrize("path", OFFICE_ONLY_GETS)
async def test_mechanic_cannot_access_office_staff_modules(path):
    actor = SimpleNamespace(
        id=uuid.uuid4(),
        service_center_id=uuid.uuid4(),
        is_active=True,
        role=SimpleNamespace(name="mechanic", is_active=True),
    )
    uow = SimpleNamespace(service_center_id=actor.service_center_id, session=object())

    async def current_user():
        return actor

    async def tenant_uow():
        yield uow

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_tenant_uow] = tenant_uow
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(path)
        assert response.status_code == 403, f"{path}: {response.text}"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_tenant_uow, None)


@pytest.mark.asyncio
async def test_mechanic_cannot_create_office_appointments():
    actor = SimpleNamespace(
        id=uuid.uuid4(),
        service_center_id=uuid.uuid4(),
        is_active=True,
        role=SimpleNamespace(name="mechanic", is_active=True),
    )
    uow = SimpleNamespace(service_center_id=actor.service_center_id, session=object())

    async def current_user():
        return actor

    async def tenant_uow():
        yield uow

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_tenant_uow] = tenant_uow
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/appointments/direct",
                json={
                    "customer_id": str(uuid.uuid4()),
                    "vehicle_id": str(uuid.uuid4()),
                    "appointment_date": "2026-10-12",
                    "appointment_time": "09:00",
                },
            )
        assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_tenant_uow, None)
