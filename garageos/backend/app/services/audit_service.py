"""AuditService — write security-relevant events to the audit trail.

Records are written in a dedicated, short-lived session/transaction, independent of
the request's Unit of Work. This is deliberate:

  * A failed login must be recorded even though the request ends in a 401 and the
    request session rolls back.
  * A successful privileged action and its audit record should not be able to
    half-commit relative to each other in surprising ways.

Auditing is best-effort observability, never a blocker: any write failure is logged
and swallowed so it can never turn a working action into a 500.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import Request

from app.core.database import async_session_factory
from app.core.rate_limit import client_ip
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

_UA_MAX = 400

# Defense in depth: even though callers are told never to put secrets in ``context``,
# redact any key that looks sensitive before it reaches the audit table. Substring
# match, case-insensitive — catches password, token, secret, authorization, api_key…
_SENSITIVE_KEY_HINTS = ("password", "token", "secret", "authorization", "api_key", "apikey", "cookie")
_REDACTED = "[REDACTED]"


def _scrub(context: Optional[dict]) -> Optional[dict]:
    if not context:
        return context
    scrubbed = {}
    for key, value in context.items():
        lowered = str(key).lower()
        scrubbed[key] = _REDACTED if any(h in lowered for h in _SENSITIVE_KEY_HINTS) else value
    return scrubbed


async def record_audit(
    *,
    action: str,
    status: str = "success",
    service_center_id: Optional[uuid.UUID] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    actor_email: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[uuid.UUID] = None,
    request: Optional[Request] = None,
    context: Optional[dict] = None,
) -> None:
    """Append one audit record. Never raises."""
    ip = None
    user_agent = None
    if request is not None:
        ip = client_ip(request)
        ua = request.headers.get("user-agent")
        user_agent = ua[:_UA_MAX] if ua else None

    try:
        async with async_session_factory() as session:
            session.add(
                AuditLog(
                    action=action,
                    status=status,
                    service_center_id=service_center_id,
                    actor_user_id=actor_user_id,
                    actor_email=actor_email,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip=ip,
                    user_agent=user_agent,
                    context=_scrub(context),
                )
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — auditing must never break the request
        logger.warning("Audit write failed for action=%s: %s", action, exc)
