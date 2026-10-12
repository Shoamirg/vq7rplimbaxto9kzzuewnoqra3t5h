from __future__ import annotations
import uuid
from datetime import timedelta
from typing import Optional

from sqlalchemy import select

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.user_repository import UserRepository
from app.repositories.base import BaseRepository
from app.models.service_center import ServiceCenter
from app.models.role import Role
from app.models.user import User
from app.exceptions import InvalidCredentials, InvalidToken


class AuthService:
    """Handles admin authentication with JWT refresh tokens."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.user_repo = UserRepository(uow.session)
        self.service_center_repo = BaseRepository(ServiceCenter, uow.session)
        self.role_repo = BaseRepository(Role, uow.session)

    async def register_admin(
        self,
        email: str,
        password: str,
        full_name: str,
        service_center_name: str,
        phone: Optional[str] = None,
    ) -> dict:
        """Register a new admin user with a service center."""
        existing = await self.user_repo.find_by_email(email)
        if existing:
            raise InvalidCredentials("Email already registered")

        service_center = await self.service_center_repo.create(
            name=service_center_name,
        )

        admin_role = await self.role_repo.create(name="admin")

        user = await self.user_repo.create(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            phone=phone,
            role_id=admin_role.id,
            service_center_id=service_center.id,
            is_super_admin=False,
        )

        return {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "service_center_id": str(service_center.id),
        }

    async def login(self, email: str, password: str) -> dict:
        """Authenticate and return token pair."""
        user = await self.user_repo.find_by_email(email)
        if not await self._is_enabled(user) or not verify_password(password, user.password_hash):
            raise InvalidCredentials()

        # Password-based entry to the configured demo tenant must remain
        # read-only too. Otherwise a public demo account could bypass the
        # protections used by /auth/demo simply by using the regular login.
        demo_domain = settings.DEMO_EMAIL.partition("@")[2].casefold()
        user_domain = user.email.rpartition("@")[2].casefold()
        demo_claim = {"demo": True} if (
            settings.DEMO_MODE_ENABLED and demo_domain and user_domain == demo_domain
        ) else {}

        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "type": "access", **demo_claim},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        refresh_token = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh", **demo_claim},
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    async def _is_enabled(self, user: User | None) -> bool:
        """A staff identity is usable only while its garage and role are active."""
        if not user or not user.is_active or not user.role or not user.role.is_active:
            return False
        center_id = await self.uow.session.scalar(
            select(ServiceCenter.id).where(
                ServiceCenter.id == user.service_center_id,
                ServiceCenter.is_active.is_(True),
            )
        )
        return center_id is not None

    async def refresh(self, refresh_token: str) -> dict:
        """Issue a new access token using a refresh token."""
        user, payload = await self._token_user(refresh_token, "refresh")

        # Carry the demo flag across refresh — otherwise a read-only demo session
        # could refresh into a full-access token and bypass the write guard.
        demo = {"demo": True} if payload.get("demo") else {}
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "type": "access", **demo},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        new_refresh = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh", **demo},
        )

        return {
            "access_token": access_token,
            "refresh_token": new_refresh,
            "token_type": "bearer",
        }

    async def demo_login(self) -> dict:
        """Mint a READ-ONLY demo session for the configured demo account.

        No password: entry is gated at the endpoint by DEMO_MODE_ENABLED. Tokens
        carry a ``demo`` claim that DemoReadOnlyMiddleware uses to reject writes.
        """
        user = await self.user_repo.find_by_email(settings.DEMO_EMAIL)
        if not await self._is_enabled(user):
            raise InvalidCredentials()
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "type": "access", "demo": True},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        refresh_token = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh", "demo": True},
        )
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    async def get_current_user(self, token: str) -> User:
        """Decode access token and return the user."""
        user, _ = await self._token_user(token, "access")
        return user

    async def _token_user(self, token: str, kind: str) -> tuple[User, dict]:
        payload = decode_token(token)
        if not payload or payload.get("type") != kind:
            raise InvalidToken()
        try:
            user_id = uuid.UUID(payload.get("sub", ""))
        except (ValueError, TypeError, AttributeError):
            raise InvalidToken()
        user = await self.user_repo.get_by_id(user_id)
        if not await self._is_enabled(user):
            raise InvalidToken()
        return user, payload
