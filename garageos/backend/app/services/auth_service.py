from __future__ import annotations
import uuid
from typing import Optional

from sqlalchemy import select

from app.core.security import (
    burn_password_check,
    hash_password,
    verify_password,
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
from app.services.auth_session_service import AuthSessionService


class AuthService:
    """Handles admin authentication with JWT refresh tokens."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.user_repo = UserRepository(uow.session)
        self.service_center_repo = BaseRepository(ServiceCenter, uow.session)
        self.role_repo = BaseRepository(Role, uow.session)
        self.sessions = AuthSessionService(uow.session)

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
        user = await self.uow.session.scalar(select(User).where(User.email == email)
            .with_for_update(of=User).execution_options(populate_existing=True))
        if not await self._is_enabled(user, lock=True):
            burn_password_check(password)  # same cost as a real miss
            raise InvalidCredentials()
        if not verify_password(password, user.password_hash):
            raise InvalidCredentials()

        # Password-based entry to the configured demo tenant must remain
        # read-only too. Otherwise a public demo account could bypass the
        # protections used by /auth/demo simply by using the regular login.
        demo_domain = settings.DEMO_EMAIL.partition("@")[2].casefold()
        user_domain = user.email.rpartition("@")[2].casefold()
        demo_claim = {"demo": True} if (
            settings.DEMO_MODE_ENABLED and demo_domain and user_domain == demo_domain
        ) else {}

        return await self.sessions.issue(kind="staff", principal_id=user.id,
            center_id=user.service_center_id,
            claims={"sub": str(user.id), "email": user.email, **demo_claim})

    async def _is_enabled(self, user: User | None, *, lock=False) -> bool:
        """A staff identity is usable only while its garage and role are active."""
        if not user or not user.is_active or not user.role or not user.role.is_active:
            return False
        role_statement = select(Role.id).where(Role.id == user.role_id, Role.is_active.is_(True))
        center_statement = select(ServiceCenter.id).where(
                ServiceCenter.id == user.service_center_id,
                ServiceCenter.is_active.is_(True),
            )
        if lock:
            role_statement = role_statement.with_for_update(read=True)
            center_statement = center_statement.with_for_update(read=True)
        return (await self.uow.session.scalar(role_statement) is not None
                and await self.uow.session.scalar(center_statement) is not None)

    async def refresh(self, refresh_token: str) -> dict:
        """Issue a new access token using a refresh token."""
        user, payload = await self._token_user(refresh_token, "refresh", lock_identity=True)

        # Carry the demo flag across refresh — otherwise a read-only demo session
        # could refresh into a full-access token and bypass the write guard.
        demo = {"demo": True} if payload.get("demo") else {}
        return await self.sessions.rotate(refresh_token, payload, "staff",
            {"sub": str(user.id), "email": user.email, **demo})

    async def demo_login(self) -> dict:
        """Mint a READ-ONLY demo session for the configured demo account.

        No password: entry is gated at the endpoint by DEMO_MODE_ENABLED. Tokens
        carry a ``demo`` claim that DemoReadOnlyMiddleware uses to reject writes.
        """
        user = await self.uow.session.scalar(select(User).where(User.email == settings.DEMO_EMAIL)
            .with_for_update(of=User).execution_options(populate_existing=True))
        if not await self._is_enabled(user, lock=True):
            raise InvalidCredentials()
        return await self.sessions.issue(kind="staff", principal_id=user.id,
            center_id=user.service_center_id,
            claims={"sub": str(user.id), "email": user.email, "demo": True})

    async def get_current_user(self, token: str) -> User:
        """Decode access token and return the user."""
        user, _ = await self._token_user(token, "access")
        return user

    async def logout(self, token: str) -> None:
        await self.sessions.logout(token, "staff")

    async def _token_user(self, token: str, kind: str, *, lock_identity=False) -> tuple[User, dict]:
        payload = decode_token(token)
        if not payload or payload.get("type") != kind:
            raise InvalidToken()
        try:
            user_id = uuid.UUID(payload.get("sub", ""))
        except (ValueError, TypeError, AttributeError):
            raise InvalidToken()
        # Identity is pinned before the token family to match disable lock order.
        statement = select(User).where(User.id == user_id)
        if lock_identity:
            statement = statement.with_for_update(of=User)
        user = await self.uow.session.scalar(statement.execution_options(populate_existing=True))
        if not await self._is_enabled(user, lock=lock_identity):
            raise InvalidToken()
        proof = self.sessions.proof(token, "staff")
        session = await self.sessions.load(proof, "staff")
        if session.service_center_id != user.service_center_id:
            raise InvalidToken()
        return user, payload
