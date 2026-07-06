"""Staff ("masters") management — add and remove the mechanics that appear on
the calendar board and in the appointment assignee dropdown.

A "master" is a tenant User with the ``mechanic`` role. The garage owner manages
them from Settings → Team; each one becomes a lane on the board and an option
when booking. Removal is a soft delete (``is_active = False``) so past
appointments and cases that named the master stay intact.
"""
from __future__ import annotations

import re
import uuid

from sqlalchemy import func, select

from app.core.roles import ADMIN, ASSIGNABLE_ROLES, SUPER_ADMIN
from app.core.security import hash_password
from app.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import MaintenanceRule, Role, ServiceCenter, User
from app.repositories.unit_of_work import UnitOfWork

# Masters can log in later if the owner wants; until then this is the shared
# default (same as the seeded demo staff). Owners can reset it per user later.
DEFAULT_PASSWORD = "demo1234"
_EMAIL_DOMAIN = "garageos.app"


def _email_slug(name: str) -> str:
    """`Carlos Mendez` -> `carlos.mendez` (safe local-part)."""
    slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
    return slug or "master"


class StaffService:
    """Manages the tenant's masters (mechanics)."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.sc = uow.service_center_id
        self.session = uow.session

    async def _mechanic_role(self) -> Role:
        role = (
            await self.session.execute(select(Role).where(Role.name == "mechanic"))
        ).scalar_one_or_none()
        if role is None:
            raise NotFoundError()
        return role

    async def list_mechanics(self) -> list[dict]:
        stmt = (
            select(User)
            .where(
                User.service_center_id == self.sc,
                User.is_active.is_(True),
            )
            .order_by(User.full_name)
        )
        users = (await self.session.execute(stmt)).scalars().all()
        role = await self._mechanic_role()
        return [
            {"id": str(u.id), "name": u.full_name, "phone": u.phone,
             "service_types": u.service_types or []}
            for u in users
            if u.role_id == role.id
        ]

    async def list_service_catalog(self) -> list[str]:
        """The service types a master can be assigned — the distinct set from the
        maintenance-rule catalog (already seeded, e.g. Oil & Filter Change)."""
        rows = (
            await self.session.execute(
                select(MaintenanceRule.service_type)
                .distinct()
                .order_by(MaintenanceRule.service_type)
            )
        ).scalars().all()
        return [r for r in rows if r]

    async def set_mechanic_services(
        self, user_id: uuid.UUID, service_types: list[str]
    ) -> dict:
        """Set which services a master performs (restricted to the catalog)."""
        user = await self._tenant_user(user_id)
        role = await self._mechanic_role()
        if user.role_id != role.id:
            raise ValidationError()
        catalog = set(await self.list_service_catalog())
        # Preserve caller order, drop anything not in the catalog, de-dup.
        cleaned: list[str] = []
        for s in service_types or []:
            if s in catalog and s not in cleaned:
                cleaned.append(s)
        user.service_types = cleaned
        await self.uow.flush()
        return {"id": str(user.id), "name": user.full_name,
                "phone": user.phone, "service_types": cleaned}

    async def add_mechanic(self, name: str, phone: str | None = None) -> dict:
        name = (name or "").strip()
        if len(name) < 2:
            raise ValidationError()
        role = await self._mechanic_role()

        center = await self.session.get(ServiceCenter, self.sc)
        tenant_slug = (center.email.split("@", 1)[0] if center and center.email else "garage")
        # A short random suffix keeps the globally-unique email collision-free even
        # when two masters share a name.
        email = f"{_email_slug(name)}.{uuid.uuid4().hex[:6]}@{tenant_slug}.{_EMAIL_DOMAIN}"

        user = User(
            email=email,
            password_hash=hash_password(DEFAULT_PASSWORD),
            full_name=name,
            phone=(phone or "").strip() or None,
            role_id=role.id,
            is_super_admin=False,
            service_center_id=self.sc,
            is_active=True,
        )
        self.session.add(user)
        await self.uow.flush()
        return {"id": str(user.id), "name": user.full_name, "phone": user.phone,
                "service_types": []}

    async def remove_mechanic(self, user_id: uuid.UUID) -> None:
        user = await self.session.get(User, user_id)
        if user is None or user.service_center_id != self.sc:
            raise NotFoundError()
        role = await self._mechanic_role()
        # Only masters are removable here — never let this soft-delete the admin.
        if user.role_id != role.id:
            raise ValidationError()
        user.is_active = False
        await self.uow.flush()

    # ─── Staff & roles (Settings → Team, admin-only) ─────────────────────────
    # These manage *all* staff of the tenant and their access roles, not just
    # the mechanic "masters" above. Guarded by require_roles(ADMIN) at the route.

    async def _role_by_name(self, name: str) -> Role:
        role = (
            await self.session.execute(select(Role).where(Role.name == name))
        ).scalar_one_or_none()
        if role is None:
            raise NotFoundError()
        return role

    async def _tenant_user(self, user_id: uuid.UUID) -> User:
        """Fetch an active user, guaranteed to belong to this tenant."""
        user = await self.session.get(User, user_id)
        if user is None or user.service_center_id != self.sc or not user.is_active:
            raise NotFoundError()
        return user

    async def _active_admin_count(self, admin_role_id) -> int:
        stmt = select(func.count()).where(
            User.service_center_id == self.sc,
            User.is_active.is_(True),
            User.role_id == admin_role_id,
        )
        return int((await self.session.execute(stmt)).scalar_one())

    def list_roles(self) -> list[dict]:
        """The roles an admin may assign through the team UI (super_admin excluded)."""
        return [{"name": name} for name in ASSIGNABLE_ROLES]

    async def list_members(self) -> list[dict]:
        stmt = (
            select(User)
            .where(User.service_center_id == self.sc, User.is_active.is_(True))
            .order_by(User.full_name)
        )
        users = (await self.session.execute(stmt)).scalars().all()
        return [
            {
                "id": str(u.id),
                "name": u.full_name,
                "email": u.email,
                "phone": u.phone,
                "role": u.role.name if u.role else None,
                "is_super_admin": u.is_super_admin,
            }
            for u in users
        ]

    async def create_member(
        self, name: str, email: str, role_name: str, password: str
    ) -> dict:
        name = (name or "").strip()
        email = (email or "").strip().lower()
        if len(name) < 2 or not email:
            raise ValidationError()
        if role_name not in ASSIGNABLE_ROLES:
            raise ValidationError()
        if len(password or "") < 6:
            raise ValidationError()

        existing = (
            await self.session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is not None:
            raise ConflictError()

        role = await self._role_by_name(role_name)
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=name,
            role_id=role.id,
            is_super_admin=False,
            service_center_id=self.sc,
            is_active=True,
        )
        self.session.add(user)
        await self.uow.flush()
        return {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role": role.name,
            "is_super_admin": False,
        }

    async def change_role(
        self, user_id: uuid.UUID, role_name: str, actor_id: uuid.UUID
    ) -> dict:
        if role_name not in ASSIGNABLE_ROLES:
            raise ValidationError()
        user = await self._tenant_user(user_id)
        # Never let the team UI touch a platform super_admin's access.
        if user.is_super_admin or (user.role and user.role.name == SUPER_ADMIN):
            raise ValidationError()

        new_role = await self._role_by_name(role_name)
        current = await self._role_by_name(ADMIN)
        # Guard against locking the tenant out: don't demote the last admin.
        if (
            user.role_id == current.id
            and new_role.id != current.id
            and await self._active_admin_count(current.id) <= 1
        ):
            raise ValidationError()

        user.role_id = new_role.id
        await self.uow.flush()
        return {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role": new_role.name,
            "is_super_admin": user.is_super_admin,
        }

    async def deactivate_member(
        self, user_id: uuid.UUID, actor_id: uuid.UUID
    ) -> None:
        if user_id == actor_id:
            # Removing yourself would be an instant self-lockout.
            raise ValidationError()
        user = await self._tenant_user(user_id)
        if user.is_super_admin or (user.role and user.role.name == SUPER_ADMIN):
            raise ValidationError()
        admin_role = await self._role_by_name(ADMIN)
        if (
            user.role_id == admin_role.id
            and await self._active_admin_count(admin_role.id) <= 1
        ):
            raise ValidationError()
        user.is_active = False
        await self.uow.flush()
