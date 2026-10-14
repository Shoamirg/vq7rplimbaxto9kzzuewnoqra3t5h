"""Customer billing — plain language, one balance, no payer scoring.

Estimate decisions (approve/decline/ask) close the commercial loop: each emits a
domain event that rings the advisor's bell and lands on the financial timeline.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import (
    AskQuestionRequest,
    AskResponse,
    BillingDoc,
    BillingResponse,
)
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


def _portal(customer: Customer, uow: UnitOfWork) -> CustomerPortalService:
    return CustomerPortalService(uow, customer)


@router.get("", response_model=BillingResponse, summary="Balance, invoices, estimates, receipts")
async def billing(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> BillingResponse:
    return await _portal(customer, uow).billing()


@router.post("/estimates/{estimate_id}/approve", response_model=BillingDoc, summary="Approve an estimate")
async def approve_estimate(
    estimate_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
) -> BillingDoc:
    return await _portal(customer, uow).approve_estimate(estimate_id)


@router.post("/estimates/{estimate_id}/decline", response_model=BillingDoc, summary="Decline an estimate")
async def decline_estimate(
    estimate_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
) -> BillingDoc:
    return await _portal(customer, uow).decline_estimate(estimate_id)


@router.post("/estimates/{estimate_id}/question", response_model=AskResponse, summary="Ask about an estimate")
async def ask_estimate(
    estimate_id: uuid.UUID,
    body: AskQuestionRequest,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
) -> AskResponse:
    return await _portal(customer, uow).ask_estimate_question(estimate_id, body.body)
