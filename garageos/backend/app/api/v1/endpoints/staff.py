import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_staff_permissions
from app.exceptions import UnauthorizedAction
from app.models import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.staff import StaffCreate, StaffUpdate
from app.services.staff_service import StaffService

router = APIRouter()


async def owner_uow(user: User = Depends(get_current_user), permissions=Depends(get_staff_permissions)):
    # A public demo carries staff.read only; a platform flag never grants owner access.
    if user.role.name != 'admin' or 'staff.write' not in permissions:
        raise UnauthorizedAction()
    async with UnitOfWork(service_center_id=user.service_center_id) as uow:
        yield uow


@router.get('')
async def list_staff(q: str = Query('', max_length=100), page: int = Query(1, ge=1, le=2147483647),
                     page_size: int = Query(30, ge=1, le=100), uow=Depends(owner_uow),
                     user=Depends(get_current_user)):
    return await StaffService(uow, user).list(q, page, page_size)


@router.post('', status_code=201)
async def create_staff(data: StaffCreate, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await StaffService(uow, user).create(data)


@router.patch('/{user_id}')
async def update_staff(user_id: uuid.UUID, data: StaffUpdate, uow=Depends(owner_uow, scope="function"), user=Depends(get_current_user)):
    return await StaffService(uow, user).update(user_id, data)
