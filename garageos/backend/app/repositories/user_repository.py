from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session):
        super().__init__(User, session)

    async def find_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(
            User.email == email,
            User.is_active == True,
        ).options(selectinload(User.role))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_service_center(self, service_center_id: uuid.UUID) -> Sequence[User]:
        stmt = select(User).where(
            User.service_center_id == service_center_id,
            User.is_active == True,
        ).options(selectinload(User.role)).order_by(User.full_name)
        result = await self.session.execute(stmt)
        return result.scalars().all()
