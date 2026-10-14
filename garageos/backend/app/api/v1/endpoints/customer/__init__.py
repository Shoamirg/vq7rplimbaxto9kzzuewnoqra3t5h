"""Customer-facing API (``/api/v1/customer``) — the Telegram Mini App's backend.

Isolated from the staff API on purpose: its own auth principal, its own deps,
and narrow customer DTOs. Each screen maps to a sub-router but every one composes
the *existing* platform services behind a strict per-customer ownership guard.
"""
from fastapi import APIRouter

from app.api.v1.endpoints.customer import (
    appointments,
    auth,
    billing,
    home,
    me,
    messages,
    roadside,
    vehicles,
)

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["customer-auth"])
router.include_router(me.router, prefix="/me", tags=["customer"])
router.include_router(home.router, prefix="/home", tags=["customer"])
router.include_router(vehicles.router, prefix="/vehicles", tags=["customer"])
router.include_router(appointments.router, prefix="/appointments", tags=["customer"])
router.include_router(billing.router, prefix="/billing", tags=["customer"])
router.include_router(messages.router, prefix="/messages", tags=["customer"])
router.include_router(roadside.router, prefix="/roadside", tags=["customer"])

from app.api.v1.endpoints.customer import history
router.include_router(history.router, prefix="/history", tags=["customer-history"])
