"""FastAPI application entry point.

Run locally:
    uvicorn app.main:app --reload

The application is built by ``create_app()`` so it can be constructed with
clean state in tests. ``app`` is the module-level instance uvicorn/Docker use.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.system import router as system_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.event_handlers import register_event_handlers
from app.core.notification_handlers import register_notification_handlers
from app.core.logging import setup_logging
from app.core.demo_mode import DemoReadOnlyMiddleware
from app.core.observability import init_sentry
from app.core.rate_limit import close_rate_limiter
from app.exceptions import GarageException, RateLimitExceeded

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks.

    Note: schema creation is owned by Alembic migrations, not startup, so we do
    not call ``init_db()`` here. Startup stays fast and side-effect free.
    """
    setup_logging()
    register_event_handlers()
    register_notification_handlers()
    logger.info(
        "Starting %s v%s (env=%s, debug=%s)",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT,
        settings.DEBUG,
    )
    try:
        yield
    finally:
        # Release the connection pools cleanly on shutdown.
        await close_rate_limiter()
        await engine.dispose()
        logger.info("Shutdown complete; database engine disposed")


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        # asyncpg exposes a stable constraint name on the original cause. Match
        # only our identity indexes; unrelated FK/not-null failures stay errors.
        cause = getattr(exc.orig, "__cause__", None)
        constraint = getattr(cause, "constraint_name", None)
        conflicts = {
            "uq_customers_center_phone_active": ("DUPLICATE_CUSTOMER_PHONE", "A customer with this phone already exists"),
            "uq_vehicles_center_plate_active": ("DUPLICATE_VEHICLE", "A vehicle with this plate or VIN already exists"),
            "uq_vehicles_center_vin_active": ("DUPLICATE_VEHICLE", "A vehicle with this plate or VIN already exists"),
        }
        if getattr(exc.orig, "sqlstate", None) == "23505" and constraint in conflicts:
            code, detail = conflicts[constraint]
            return JSONResponse(status_code=409, content={"error": {"code": code, "detail": detail}})
        return await handle_unexpected_error(request, exc)

    @app.exception_handler(GarageException)
    async def handle_garage_exception(request: Request, exc: GarageException) -> JSONResponse:
        headers = None
        if isinstance(exc, RateLimitExceeded) and exc.retry_after:
            headers = {"Retry-After": str(exc.retry_after)}
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "detail": exc.detail}},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            # Pydantic can attach NaN/Infinity inputs or ValueError instances.
            # Return the field/message contract without non-JSON-safe context.
            content={"error": {"code": "VALIDATION_ERROR", "detail": [
                {key: error[key] for key in ("type", "loc", "msg") if key in error}
                for error in exc.errors()
            ]}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        # Never leak internals to the client; full trace is in the logs above.
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "detail": "Internal server error"}},
        )


def create_app() -> FastAPI:
    setup_logging()
    init_sentry()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Read-only guard for public demo sessions (rejects writes from demo tokens).
    app.add_middleware(DemoReadOnlyMiddleware)

    _register_exception_handlers(app)

    # System probes at the root; versioned API under its prefix.
    app.include_router(system_router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
