"""Customer self-service appointment booking (Telegram Mini App).

Booking rides the same AppointmentService the staff use, so a customer-created
appointment emits AppointmentCreated and flows into the calendar, operations,
notifications, and reports — one event stream, no special-casing.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.core.idempotency import execute_idempotent
from app.core.rate_limit import write_rate_limit
from app.core.timezone import local_date_for_instant, service_center_timezone
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import BookingRequest, BookingResult
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get("/today", summary="Service-center local date for booking")
async def booking_today(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> dict[str, str]:
    timezone_name = await service_center_timezone(uow.session, customer.service_center_id)
    today = local_date_for_instant(datetime.now(timezone.utc), timezone_name)
    return {"today": today.isoformat()}


@router.post(
    "",
    response_model=BookingResult,
    summary="Book an appointment for one of my vehicles",
    dependencies=[Depends(write_rate_limit)],
)
async def book_appointment(
    body: BookingRequest,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=128),
) -> BookingResult:
    async def _create() -> BookingResult:
        return await CustomerPortalService(uow, customer).create_appointment(body)

    return await execute_idempotent(
        uow,
        key=idempotency_key,
        operation="customer.appointment.create.v1",
        request={"customer_id": str(customer.id), "body": body.model_dump(mode="json")},
        execute=_create,
    )
