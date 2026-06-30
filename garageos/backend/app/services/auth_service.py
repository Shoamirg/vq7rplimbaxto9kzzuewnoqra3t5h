from __future__ import annotations
import uuid
from datetime import timedelta
from typing import Optional

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
from app.exceptions import InvalidCredentials, TokenExpired, InvalidToken, UserNotFound


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
            is_super_admin=True,
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
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentials()

        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "type": "access"},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        refresh_token = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh"},
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    async def refresh(self, refresh_token: str) -> dict:
        """Issue a new access token using a refresh token."""
        payload = decode_token(refresh_token)
        if not payload:
            raise InvalidToken()
        if payload.get("type") != "refresh":
            raise InvalidToken("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise InvalidToken()

        user = await self.user_repo.get_by_id(uuid.UUID(user_id))
        if not user:
            raise UserNotFound()

        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email, "type": "access"},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        new_refresh = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh"},
        )

        return {
            "access_token": access_token,
            "refresh_token": new_refresh,
            "token_type": "bearer",
        }

    async def get_current_user(self, token: str) -> User:
        """Decode access token and return the user."""
        payload = decode_token(token)
        if not payload:
            raise InvalidToken()
        if payload.get("type") != "access":
            raise InvalidToken("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise InvalidToken()

        user = await self.user_repo.get_by_id(uuid.UUID(user_id))
        if not user:
            raise UserNotFound()
        return user
