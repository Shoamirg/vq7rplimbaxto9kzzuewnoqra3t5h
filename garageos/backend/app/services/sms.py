"""Outbound SMS for verification codes.

One small interface, chosen by ``SMS_PROVIDER``:
  * ``disabled`` — no sender; code-based endpoints answer 503.
  * ``console``  — logs the message (development/test only; rejected in deploys).
  * ``eskiz``    — notify.eskiz.uz. The bearer token is cached and refreshed
    once on 401 (Eskiz tokens expire after ~30 days).
"""
from __future__ import annotations

import logging
from typing import NamedTuple, Optional, Protocol

import httpx

from app.core.config import settings
from app.exceptions import GarageException

logger = logging.getLogger(__name__)


class SmsUnavailable(GarageException):
    status_code = 503
    code = "SMS_UNAVAILABLE"
    detail = "SMS delivery is temporarily unavailable. Please try again later."


class OutgoingSms(NamedTuple):
    phone: str
    message: str


async def deliver_sms(sms: OutgoingSms) -> None:
    """Background delivery after the HTTP response has been sent.

    Failures are logged, never raised: the client already got the same answer
    it would get when nothing matched.
    """
    try:
        await get_sms_sender().send(sms.phone, sms.message)
    except Exception as exc:  # noqa: BLE001
        logger.error("Verification SMS not delivered (%s)", type(exc).__name__)


class SmsSender(Protocol):
    async def send(self, phone: str, message: str) -> None: ...


class ConsoleSmsSender:
    """Development sender: the code is visible in the server log only."""

    sent: list[tuple[str, str]] = []

    async def send(self, phone: str, message: str) -> None:
        self.sent.append((phone, message))
        logger.warning("SMS (console provider) to %s: %s", phone, message)


class EskizSmsSender:
    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client
        self._token: Optional[str] = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=settings.ESKIZ_BASE_URL, timeout=10)
        return self._client

    async def _login(self) -> str:
        response = await self._http().post("/auth/login", data={
            "email": settings.ESKIZ_EMAIL, "password": settings.ESKIZ_PASSWORD})
        response.raise_for_status()
        self._token = response.json()["data"]["token"]
        return self._token

    async def send(self, phone: str, message: str) -> None:
        try:
            token = self._token or await self._login()
            for attempt in range(2):
                response = await self._http().post(
                    "/message/sms/send",
                    headers={"Authorization": f"Bearer {token}"},
                    data={"mobile_phone": phone, "message": message, "from": settings.ESKIZ_SENDER},
                )
                if response.status_code == 401 and attempt == 0:
                    token = await self._login()
                    continue
                response.raise_for_status()
                return
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            # Never log the message body: it carries the code.
            logger.error("Eskiz SMS delivery failed (%s)", type(exc).__name__)
            raise SmsUnavailable() from None


_sender: Optional[SmsSender] = None


def get_sms_sender() -> SmsSender:
    global _sender
    if settings.SMS_PROVIDER == "disabled":
        raise SmsUnavailable()
    if _sender is None:
        _sender = ConsoleSmsSender() if settings.SMS_PROVIDER == "console" else EskizSmsSender()
    return _sender


def set_sms_sender(sender: Optional[SmsSender]) -> None:
    """Swap the process sender (tests)."""
    global _sender
    _sender = sender
