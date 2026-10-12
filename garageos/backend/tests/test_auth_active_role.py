"""Disabled roles must lose both existing and renewable staff sessions."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.exceptions import InvalidCredentials, InvalidToken, UserNotFound
from app.services import auth_service as auth_module
from app.services.auth_service import AuthService


def make_service(user):
    service = AuthService(SimpleNamespace(session=object()))

    async def find_by_email(_email):
        return user

    async def get_by_id(_user_id):
        return user

    service.user_repo.find_by_email = find_by_email
    service.user_repo.get_by_id = get_by_id
    return service


def inactive_role_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="staff@example.test",
        password_hash="unused-by-test",
        is_active=True,
        role=SimpleNamespace(is_active=False),
    )


@pytest.mark.asyncio
async def test_login_rejects_user_with_inactive_role(monkeypatch):
    service = make_service(inactive_role_user())
    monkeypatch.setattr(auth_module, "verify_password", lambda *_args: True)

    with pytest.raises(InvalidCredentials):
        await service.login("staff@example.test", "password")


@pytest.mark.asyncio
async def test_refresh_rejects_user_with_inactive_role(monkeypatch):
    user = inactive_role_user()
    service = make_service(user)
    monkeypatch.setattr(auth_module, "decode_token", lambda _token: {
        "type": "refresh", "sub": str(user.id),
    })

    with pytest.raises(InvalidToken):
        await service.refresh("refresh-token")


@pytest.mark.asyncio
async def test_access_token_rejects_user_with_inactive_role(monkeypatch):
    user = inactive_role_user()
    service = make_service(user)
    monkeypatch.setattr(auth_module, "decode_token", lambda _token: {
        "type": "access", "sub": str(user.id),
    })

    with pytest.raises(InvalidToken):
        await service.get_current_user("access-token")


@pytest.mark.asyncio
async def test_demo_login_does_not_mint_tokens_for_inactive_role(monkeypatch):
    user = inactive_role_user()
    service = make_service(user)
    monkeypatch.setattr(auth_module.settings, "DEMO_EMAIL", user.email)

    with pytest.raises(UserNotFound):
        await service.demo_login()
