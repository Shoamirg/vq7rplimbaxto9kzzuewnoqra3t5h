import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_staff_permissions
from app.exceptions import UnauthorizedAction
from app.models import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.staff import StaffCreate, StaffUpdate
from app.services.staff_service import StaffService
from app.services.team_service import TeamService

router = APIRouter()


async def owner_uow(user: User = Depends(get_current_user), permissions=Depends(get_staff_permissions)):
    # A public demo carries staff.read only; a platform flag never grants owner access.
    if user.role.name != 'admin' or 'staff.write' not in permissions:
        raise UnauthorizedAction()
    async with UnitOfWork(service_center_id=user.service_center_id) as uow:
        uow.actor_user_id = user.id
        yield uow


@router.get('')
async def list_staff(q: str = Query('', max_length=100), page: int = Query(1, ge=1, le=2147483647),
                     page_size: int = Query(30, ge=1, le=100), uow=Depends(owner_uow),
                     user=Depends(get_current_user)):
    return await StaffService(uow, user).list(q, page, page_size)


@router.post('', status_code=201)
async def create_staff(data: StaffCreate, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await StaffService(uow, user).create(data)


class MasterCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=32)


class MasterServices(BaseModel):
    service_types: list[str] = Field(default_factory=list, max_length=200)


@router.get('/mechanics')
async def list_masters(uow=Depends(owner_uow), user=Depends(get_current_user)):
    return await TeamService(uow, user).mechanics()


@router.post('/mechanics', status_code=201)
async def add_master(data: MasterCreate, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await TeamService(uow, user).add_mechanic(data.name, data.phone)


@router.delete('/mechanics/{user_id}')
async def remove_master(user_id: uuid.UUID, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    await TeamService(uow, user).remove_mechanic(user_id)
    return {'ok': True}


@router.get('/services')
async def list_services(uow=Depends(owner_uow), user=Depends(get_current_user)):
    return await TeamService(uow, user).catalog()


@router.put('/mechanics/{user_id}/services')
async def set_master_services(user_id: uuid.UUID, data: MasterServices,
                              uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await TeamService(uow, user).set_services(user_id, data.service_types)


@router.patch('/{user_id}')
async def update_staff(user_id: uuid.UUID, data: StaffUpdate, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await StaffService(uow, user).update(user_id, data)
