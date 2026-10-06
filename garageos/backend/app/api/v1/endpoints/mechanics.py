"""Active mechanic accounts in the caller's garage."""
from fastapi import APIRouter, Depends

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.user_repository import UserRepository

router = APIRouter()


@router.get("")
async def list_mechanics(uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    users = await UserRepository(uow.session).mechanics(uow.service_center_id)
    return {"items": [{"id": str(user.id), "full_name": user.full_name,
                       "email": user.email} for user in users]}
