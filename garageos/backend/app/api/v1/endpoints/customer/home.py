"""The customer Home screen — one action-first aggregation."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import HomeResponse
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get('/activity', summary='Customer-safe notification feed')
async def activity(customer: Customer = Depends(get_current_customer),
                   uow: UnitOfWork = Depends(get_customer_uow)):
    return {'items': await CustomerPortalService(uow, customer)._activity(limit=30)}


@router.get("", response_model=HomeResponse, summary="Home: SOS, appointment, invoice, messages, health")
async def home(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> HomeResponse:
    return await CustomerPortalService(uow, customer).home()
