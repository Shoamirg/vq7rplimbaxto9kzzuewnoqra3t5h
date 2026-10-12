"""Aggregate router for API v1.

Feature routers are included here as they are implemented. ``main.py`` mounts
this single router under ``settings.API_V1_PREFIX``.
"""
from fastapi import APIRouter, Depends

from app.api.deps import get_office_staff_user

from app.api.v1.endpoints import (
    appointments, auth, calendar, cases, conversations, customers, fleet,
    invoices, notifications, public, reports, search, slots, vehicles, work_orders,
)
from app.api.v1.endpoints import customer as customer_portal

api_router = APIRouter()

# Staff data and operations are office-only by default. Work orders have a
# separate, narrower policy that lets mechanics access only assigned jobs;
# customer portal and public routes use their own authentication boundaries.
OFFICE_ONLY = (Depends(get_office_staff_user),)

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    appointments.router,
    prefix="/appointments",
    tags=["appointments"],
    dependencies=OFFICE_ONLY,
)
api_router.include_router(work_orders.router, prefix="/work-orders", tags=["work-orders"])
api_router.include_router(
    slots.router, prefix="/slots", tags=["slots"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    calendar.router, prefix="/calendar", tags=["calendar"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    vehicles.router, prefix="/vehicles", tags=["vehicles"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    customers.router, prefix="/customers", tags=["customers"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    search.router, prefix="/search", tags=["search"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"],
    dependencies=OFFICE_ONLY,
)
api_router.include_router(
    cases.router, prefix="/cases", tags=["cases"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    conversations.router,
    prefix="/conversations",
    tags=["conversations"],
    dependencies=OFFICE_ONLY,
)
api_router.include_router(
    invoices.router, prefix="/invoices", tags=["invoices"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    reports.router, prefix="/reports", tags=["reports"], dependencies=OFFICE_ONLY
)
api_router.include_router(
    fleet.router, prefix="/fleet", tags=["fleet"], dependencies=OFFICE_ONLY
)
api_router.include_router(public.router, prefix="/public", tags=["public"])
api_router.include_router(customer_portal.router, prefix="/customer")
