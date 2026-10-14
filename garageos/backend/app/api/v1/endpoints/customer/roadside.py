"""Customer roadside assistance.

Creating a request opens an ``OperationalCase`` (case_type=emergency) exactly
like any other channel — it emits ``CaseOpened``, so the dispatcher sees it in
the Operations Center and the notification/timeline engine lights up. No
special-case Telegram logic: the Mini App is just another channel onto the same
event stream.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.core.rate_limit import write_rate_limit
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import (
    RoadsideAttachmentRequest,
    RoadsideCase,
    RoadsideRequest,
)
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.post(
    "",
    response_model=RoadsideCase,
    summary="Request roadside assistance (opens a case)",
    dependencies=[Depends(write_rate_limit)],
)
async def request_roadside(
    body: RoadsideRequest,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
) -> RoadsideCase:
    return await CustomerPortalService(uow, customer).create_roadside(body)


@router.post("/{case_id}/attachment", response_model=RoadsideCase, summary="Attach location/photo/voice to a case")
async def add_attachment(
    case_id: uuid.UUID,
    body: RoadsideAttachmentRequest,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
) -> RoadsideCase:
    return await CustomerPortalService(uow, customer).add_roadside_attachment(case_id, body)


@router.get("/{case_id}", response_model=RoadsideCase, summary="Live status of a roadside case")
async def roadside_status(
    case_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> RoadsideCase:
    return await CustomerPortalService(uow, customer).roadside_status(case_id)
