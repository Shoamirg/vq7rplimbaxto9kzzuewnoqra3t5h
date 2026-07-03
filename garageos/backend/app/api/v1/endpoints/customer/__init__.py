"""Customer-facing API (``/api/v1/customer``) — the Telegram Mini App's backend.

Isolated from the staff API on purpose: its own auth principal, its own deps,
and narrow customer DTOs. Sub-routers are added here as each phase lands
(auth + me first; home, vehicles, billing, messages, roadside follow).
"""
from fastapi import APIRouter

from app.api.v1.endpoints.customer import auth, me

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["customer-auth"])
router.include_router(me.router, prefix="/me", tags=["customer"])
