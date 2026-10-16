"""Issuer identity follows the owning document through real PostgreSQL + HTTP."""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import update

from app.core.database import async_session_factory, engine
from app.models import ServiceCenter
from tests.support.document_issuer import create_profiles, remove_profiles
from tests.test_staff_access_lifecycle import client  # noqa: F401


@pytest_asyncio.fixture
async def issuer_profiles():
    async with async_session_factory() as session:
        profiles = await create_profiles(session)
    try:
        yield profiles
    finally:
        async with async_session_factory() as session:
            await remove_profiles(session, profiles)
        await engine.dispose()


@pytest.mark.parametrize("kind", ["invoice", "estimate"])
async def test_staff_and_public_document_issuer_is_owner_with_exact_allowlist(client, issuer_profiles, kind):
    for profile, other in [issuer_profiles, list(reversed(issuer_profiles))]:
        login = await client.post("/api/v1/auth/login", json={"email": profile["email"], "password": profile["password"]})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        doc = next(d for d in profile["documents"] if d["kind"] == kind)
        staff = await client.get(f"/api/v1/invoices/{doc['id']}", headers=headers)
        public = await client.get(f"/api/v1/public/invoice/{doc['id']}")
        assert staff.status_code == public.status_code == 200
        for response in [staff, public]:
            data = response.json()
            assert data.get("issuer") == profile["issuer"]
            assert set(data["issuer"]) == {"name", "tagline", "monogram", "phone", "address"}
            assert data["id"] == doc["id"] and data["kind"] == kind
            assert data["currency"] == "UZS" and data["total"] == data["balance"] == 208333.33
            assert data["amount_paid"] == 0 and len(data["line_items"]) == 1
            assert data["line_items"][0]["quantity"] == 1.5
        foreign = next(d for d in other["documents"] if d["kind"] == kind)
        assert (await client.get(f"/api/v1/invoices/{foreign['id']}", headers=headers)).status_code == 404


async def test_issuer_is_current_profile_and_preserves_existing_public_visibility(client, issuer_profiles):
    profile = issuer_profiles[0]
    doc = profile["documents"][0]
    async with async_session_factory() as session:
        await session.execute(update(ServiceCenter).where(ServiceCenter.id == uuid.UUID(profile["center_id"]))
                              .values(brand_name=None, name="Yangilangan Servis", monogram=None,
                                      phone=None, address=None, tagline=None, is_active=False))
        await session.commit()
    # The existing public UUID route allows active documents even when the
    # center is inactive. Presentation must neither change that policy nor
    # substitute a different center. Staff login still rejects suspension.
    response = await client.get(f"/api/v1/public/invoice/{doc['id']}")
    assert response.status_code == 200
    assert response.json().get("issuer") == {"name": "Yangilangan Servis", "tagline": None,
                                            "monogram": "YS", "phone": None, "address": None}
    login = await client.post("/api/v1/auth/login", json={"email": profile["email"], "password": profile["password"]})
    assert login.status_code == 401
