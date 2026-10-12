"""Aggregate router for API v1.

Feature routers are included here as they are implemented. ``main.py`` mounts
this single router under ``settings.API_V1_PREFIX``.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    appointments, auth, calendar, cases, conversations, customers, fleet,
    invoices, notifications, public, reports, search, slots, vehicles, work_orders,
)
from app.api.v1.endpoints import customer as customer_portal

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(work_orders.router, prefix="/work-orders", tags=["work-orders"])
api_router.include_router(slots.router, prefix="/slots", tags=["slots"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(cases.router, prefix="/cases", tags=["cases"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(fleet.router, prefix="/fleet", tags=["fleet"])
api_router.include_router(public.router, prefix="/public", tags=["public"])
api_router.include_router(customer_portal.router, prefix="/customer")
