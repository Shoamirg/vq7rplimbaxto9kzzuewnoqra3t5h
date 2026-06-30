"""Aggregate router for API v1.

Feature routers (auth, vehicles, customers, appointments, maintenance) are
included here as they are implemented. Keeping a single aggregate keeps
``main.py`` stable: it mounts this one router under ``settings.API_V1_PREFIX``.
"""
from fastapi import APIRouter

api_router = APIRouter()

# Feature routers are wired in as vertical slices land, e.g.:
#   from app.api.v1.endpoints import auth, vehicles
#   api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
#   api_router.include_router(vehicles.router, prefix="/vehicles", tags=["vehicles"])
