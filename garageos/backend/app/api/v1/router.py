"""Aggregate router for API v1.

Feature routers are included here as they are implemented. ``main.py`` mounts
this single router under ``settings.API_V1_PREFIX``.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import appointments, auth, slots

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(slots.router, prefix="/slots", tags=["slots"])
