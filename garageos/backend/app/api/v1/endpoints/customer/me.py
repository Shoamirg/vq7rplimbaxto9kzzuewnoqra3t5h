"""The authenticated customer's own profile + garage identity."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import MeResponse
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get("", response_model=MeResponse, summary="Current customer profile")
async def me(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> MeResponse:
    return await CustomerPortalService(uow, customer).me()
