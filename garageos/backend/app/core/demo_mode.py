"""Read-only guard for the public demo.

A demo session is an ordinary staff token carrying a ``demo`` claim (minted by
``/auth/demo``). This one middleware rejects every state-changing request from such
a token, so the demo tenant is explorable but immutable — no per-endpoint checks,
and no data reset ever needed because visitors can't write.

Reads (GET/HEAD/OPTIONS) always pass. Auth endpoints are exempt so a demo session
can still be established and refreshed (the ``demo`` claim is preserved across
refresh, so this doesn't open an escalation path).
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.security import decode_token

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Establishing / refreshing a demo session must still work.
_EXEMPT_SUFFIXES = ("/auth/demo", "/auth/refresh", "/auth/login", "/auth/logout")


class DemoReadOnlyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in _WRITE_METHODS and not request.url.path.endswith(_EXEMPT_SUFFIXES):
            header = request.headers.get("authorization", "")
            if header.lower().startswith("bearer "):
                payload = decode_token(header[7:])
                if payload and payload.get("demo"):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "error": {
                                "code": "DEMO_READ_ONLY",
                                "detail": "This is a read-only demo. Book a demo to try it for real.",
                            }
                        },
                    )
        return await call_next(request)
