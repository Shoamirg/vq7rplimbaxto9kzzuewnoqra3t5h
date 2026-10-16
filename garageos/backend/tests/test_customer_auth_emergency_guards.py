"""The unverified customer-link and development sign-in routes stay disabled."""
from __future__ import annotations

import httpx
import pytest

from app.core.config import settings
from app.exceptions import NotFoundError
from app.main import app
from app.services.customer_auth_service import CustomerAuthService


@pytest.mark.asyncio
async def test_customer_dev_sign_in_requires_explicit_development_opt_in(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "DEV_AUTH_ENABLED", False)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/v1/customer/auth/dev")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_telegram_phone_link_is_disabled_by_default(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_PHONE_LINKING_ENABLED", False)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/customer/auth/link",
            json={"init_data": "untrusted", "phone": "+998901234567"},
        )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_customer_auth_service_cannot_link_by_phone_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_PHONE_LINKING_ENABLED", False)
    service = object.__new__(CustomerAuthService)

    with pytest.raises(NotFoundError):
        await service.link_by_phone("untrusted", "+998901234567")


@pytest.mark.asyncio
async def test_customer_auth_service_dev_login_requires_explicit_opt_in(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "DEV_AUTH_ENABLED", False)
    service = object.__new__(CustomerAuthService)

    with pytest.raises(NotFoundError):
        await service.dev_authenticate()
