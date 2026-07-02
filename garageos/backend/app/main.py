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

from app.api.system import router as system_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.event_handlers import register_event_handlers
from app.core.notification_handlers import register_notification_handlers
from app.core.logging import setup_logging
from app.exceptions import GarageException

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
        # Release the connection pool cleanly on shutdown.
        await engine.dispose()
        logger.info("Shutdown complete; database engine disposed")


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(GarageException)
    async def handle_garage_exception(request: Request, exc: GarageException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "detail": exc.detail}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "detail": exc.errors()}},
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

    _register_exception_handlers(app)

    # System probes at the root; versioned API under its prefix.
    app.include_router(system_router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
