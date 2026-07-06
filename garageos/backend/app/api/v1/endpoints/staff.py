"""Staff / masters management — Settings → Team.

Add and remove the mechanics ("masters") that appear as lanes on the calendar
board and as assignees when booking. Tenant-scoped via the unit of work.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import get_tenant_uow, require_roles
from app.core.rate_limit import write_rate_limit
from app.core.roles import ADMIN
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.staff_service import StaffService

router = APIRouter()


class MasterCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=32)


class MemberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    role: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class RoleChange(BaseModel):
    role: str = Field(min_length=2, max_length=50)


class MasterServices(BaseModel):
    service_types: list[str] = Field(default_factory=list)


@router.get("/mechanics", summary="List masters (mechanics) for this garage")
async def list_masters(uow: UnitOfWork = Depends(get_tenant_uow)) -> list:
    return await StaffService(uow).list_mechanics()


@router.post(
    "/mechanics",
    summary="Add a master (mechanic)",
    dependencies=[Depends(write_rate_limit)],
)
async def add_master(
    payload: MasterCreate,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await StaffService(uow).add_mechanic(payload.name, payload.phone)


@router.delete(
    "/mechanics/{user_id}",
    summary="Remove a master (mechanic)",
    dependencies=[Depends(write_rate_limit)],
)
async def remove_master(
    user_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    await StaffService(uow).remove_mechanic(user_id)
    return {"ok": True}


@router.get("/services", summary="Service catalog a master can be assigned")
async def list_services(uow: UnitOfWork = Depends(get_tenant_uow)) -> list:
    return await StaffService(uow).list_service_catalog()


@router.put(
    "/mechanics/{user_id}/services",
    summary="Set the services a master performs (admin)",
    dependencies=[Depends(write_rate_limit)],
)
async def set_master_services(
    user_id: uuid.UUID,
    payload: MasterServices,
    _: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await StaffService(uow).set_mechanic_services(user_id, payload.service_types)


# ─── Staff & roles management (admin-only) ───────────────────────────────────
# require_roles(ADMIN) gates every route below and yields the acting admin, so
# the service can guard against self-lockout (self-removal / last-admin demote).


@router.get("/roles", summary="List assignable roles")
async def list_roles(
    _: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> list:
    return StaffService(uow).list_roles()


@router.get("/members", summary="List all staff of this garage with their roles")
async def list_members(
    _: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> list:
    return await StaffService(uow).list_members()


@router.post(
    "/members",
    summary="Add a staff member with a role",
    dependencies=[Depends(write_rate_limit)],
)
async def add_member(
    payload: MemberCreate,
    _: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await StaffService(uow).create_member(
        payload.name, payload.email, payload.role, payload.password
    )


@router.patch(
    "/members/{user_id}/role",
    summary="Change a staff member's role",
    dependencies=[Depends(write_rate_limit)],
)
async def change_member_role(
    user_id: uuid.UUID,
    payload: RoleChange,
    actor: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await StaffService(uow).change_role(user_id, payload.role, actor.id)


@router.delete(
    "/members/{user_id}",
    summary="Deactivate a staff member",
    dependencies=[Depends(write_rate_limit)],
)
async def remove_member(
    user_id: uuid.UUID,
    actor: User = Depends(require_roles(ADMIN)),
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    await StaffService(uow).deactivate_member(user_id, actor.id)
    return {"ok": True}
