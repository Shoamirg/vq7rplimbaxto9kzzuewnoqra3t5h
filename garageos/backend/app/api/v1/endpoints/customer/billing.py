"""Customer billing — plain language, one balance, no payer scoring."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import BillingResponse
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get("", response_model=BillingResponse, summary="Balance, invoices, estimates, receipts")
async def billing(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> BillingResponse:
    return await CustomerPortalService(uow, customer).billing()
