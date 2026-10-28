"""Aggregate router for API v1.

Feature routers are included here as they are implemented. ``main.py`` mounts
this single router under ``settings.API_V1_PREFIX``.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    appointments, auth, calendar, cases, conversations, customers, files, fleet,
    invoices, mechanics, mechanic_work, notifications, public, reference, reports,
    search, slots, staff, telegram_gateway, vehicles, workshop,
)
from app.api.v1.endpoints import customer as customer_portal
from app.api.v1.endpoints import platform, platform_control

api_router = APIRouter()

from app.core.config import settings
if settings.LOCAL_TEST_MODE and settings.ENVIRONMENT == 'development':
    from app.api.local_test import router as local_test_router
    api_router.include_router(local_test_router, prefix='/local-test', tags=['local-test'])

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(staff.router, prefix="/staff", tags=["staff"])
api_router.include_router(mechanics.router, prefix="/mechanics", tags=["mechanics"])
api_router.include_router(mechanic_work.router, prefix="/mechanic/work", tags=["mechanic-work"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(slots.router, prefix="/slots", tags=["slots"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(cases.router, prefix="/cases", tags=["cases"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(fleet.router, prefix="/fleet", tags=["fleet"])
api_router.include_router(public.router, prefix="/public", tags=["public"])
api_router.include_router(customer_portal.router, prefix="/customer")

api_router.include_router(platform.router, prefix="/platform", tags=["platform"])
api_router.include_router(platform_control.router, prefix="/platform", tags=["platform-control"])

api_router.include_router(reference.router, prefix="/reference", tags=["reference"])
api_router.include_router(telegram_gateway.router, prefix="/telegram", tags=["telegram"])
api_router.include_router(workshop.router, prefix="/workshop", tags=["workshop"])
