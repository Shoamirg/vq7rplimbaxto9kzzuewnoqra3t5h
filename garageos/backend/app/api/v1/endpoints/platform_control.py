"""Platform control center: manage the Platform → Network → Workshop tree,
workshop staff access, and read the audit log across tenants."""
import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.platform_deps import get_platform_operator
from app.core.database import get_db
from app.core.rate_limit import write_rate_limit
from app.models.user import User
from app.schemas.platform import (
    AuditPage, NetworkCreate, NetworkNode, NetworkUpdate, PlatformTree, StaffAccessUpdate,
    StaffMember, WorkshopCreate, WorkshopNode, WorkshopUpdate,
)
from app.services.platform_control_service import PlatformControlService

router = APIRouter()
_writes = [Depends(write_rate_limit)]


def _service(request: Request, operator: User = Depends(get_platform_operator),
             db: AsyncSession = Depends(get_db)) -> PlatformControlService:
    return PlatformControlService(db, operator, request)


@router.get('/tree', response_model=PlatformTree, summary='Networks with their workshops, plus independents')
async def tree(service: PlatformControlService = Depends(_service)):
    return await service.tree()


@router.post('/networks', response_model=NetworkNode, status_code=status.HTTP_201_CREATED, dependencies=_writes)
async def create_network(body: NetworkCreate, service: PlatformControlService = Depends(_service)):
    return await service.create_network(body)


@router.patch('/networks/{network_id}', response_model=NetworkNode, dependencies=_writes)
async def update_network(network_id: uuid.UUID, body: NetworkUpdate,
                         service: PlatformControlService = Depends(_service)):
    return await service.update_network(network_id, body)


@router.post('/workshops', response_model=WorkshopNode, status_code=status.HTTP_201_CREATED, dependencies=_writes)
async def create_workshop(body: WorkshopCreate, service: PlatformControlService = Depends(_service)):
    return await service.create_workshop(body)


@router.patch('/workshops/{center_id}', response_model=WorkshopNode, dependencies=_writes)
async def update_workshop(center_id: uuid.UUID, body: WorkshopUpdate,
                          service: PlatformControlService = Depends(_service)):
    return await service.update_workshop(center_id, body)


@router.get('/workshops/{center_id}/staff', response_model=list[StaffMember])
async def workshop_staff(center_id: uuid.UUID, service: PlatformControlService = Depends(_service)):
    return await service.staff(center_id)


@router.patch('/staff/{user_id}', response_model=StaffMember, dependencies=_writes)
async def update_staff(user_id: uuid.UUID, body: StaffAccessUpdate,
                       service: PlatformControlService = Depends(_service)):
    return await service.update_staff(user_id, body)


@router.get('/audit', response_model=AuditPage, summary='Audit log across workshops')
async def audit_log(
    page: int = Query(1, ge=1, le=100000),
    center_id: uuid.UUID | None = None,
    network_id: uuid.UUID | None = None,
    action: str = Query('', max_length=64),
    service: PlatformControlService = Depends(_service),
):
    return await service.audit_log(page=page, center_id=center_id, network_id=network_id, action=action)
