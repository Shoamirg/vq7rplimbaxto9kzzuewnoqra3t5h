"""Optional error monitoring via Sentry.

Sentry is strictly opt-in: it initializes only when ``SENTRY_DSN`` is set, and the
SDK import is guarded so the app runs identically whether or not the package is
installed. This keeps dev/CI silent and dependency-light while giving production a
one-env-var switch to full error tracking.

Sensitive data is scrubbed: ``send_default_pii=False`` keeps request bodies,
cookies, and auth headers out of events by default.
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> bool:
    """Initialize Sentry if configured. Returns True when active."""
    if not settings.SENTRY_DSN:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning(
            "SENTRY_DSN is set but sentry-sdk is not installed; "
            "run 'pip install sentry-sdk[fastapi]' to enable error monitoring"
        )
        return False

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT or settings.ENVIRONMENT,
        release=settings.APP_VERSION,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Do not ship PII (bodies, cookies, auth headers) unless explicitly wanted.
        send_default_pii=False,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    logger.info(
        "Sentry error monitoring active (env=%s, traces=%.2f)",
        settings.SENTRY_ENVIRONMENT or settings.ENVIRONMENT,
        settings.SENTRY_TRACES_SAMPLE_RATE,
    )
    return True
