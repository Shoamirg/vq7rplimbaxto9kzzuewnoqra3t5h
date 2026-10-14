"""Customer self-service appointment booking (Telegram Mini App).

Booking rides the same AppointmentService the staff use, so a customer-created
appointment emits AppointmentCreated and flows into the calendar, operations,
notifications, and reports — one event stream, no special-casing.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.core.rate_limit import write_rate_limit
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import BookingRequest, BookingResult
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


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
) -> BookingResult:
    return await CustomerPortalService(uow, customer).create_appointment(body)
