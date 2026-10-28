"""Unit tests for SMS service and Eskiz.uz provider."""
from __future__ import annotations

import httpx
import pytest

from app.core.config import settings
from app.services.sms import (
    ConsoleSmsSender,
    EskizSmsSender,
    OutgoingSms,
    SmsUnavailable,
    deliver_sms,
    get_sms_sender,
    set_sms_sender,
)


@pytest.fixture(autouse=True)
def reset_sms_sender():
    set_sms_sender(None)
    ConsoleSmsSender.sent = []
    yield
    set_sms_sender(None)
    ConsoleSmsSender.sent = []


@pytest.mark.asyncio
async def test_console_sms_sender_records_sent_messages():
    sender = ConsoleSmsSender()
    await sender.send("+998901234567", "Your code is 1234")
    assert sender.sent == [("+998901234567", "Your code is 1234")]


@pytest.mark.asyncio
async def test_eskiz_sms_sender_success_and_token_caching(monkeypatch):
    monkeypatch.setattr(settings, "ESKIZ_EMAIL", "test@example.com")
    monkeypatch.setattr(settings, "ESKIZ_PASSWORD", "secret")
    monkeypatch.setattr(settings, "ESKIZ_SENDER", "4546")

    login_calls = 0
    send_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal login_calls, send_calls
        if request.url.path.endswith("/auth/login"):
            login_calls += 1
            return httpx.Response(200, json={"data": {"token": "valid-token-123"}})
        if request.url.path.endswith("/message/sms/send"):
            send_calls += 1
            assert request.headers.get("Authorization") == "Bearer valid-token-123"
            return httpx.Response(200, json={"status": "waiting"})
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://notify.eskiz.uz/api")
    sender = EskizSmsSender(client=client)

    # First send: logs in and sends
    await sender.send("998901234567", "Test code: 1111")
    assert login_calls == 1
    assert send_calls == 1

    # Second send: uses cached token without re-login
    await sender.send("998909876543", "Test code: 2222")
    assert login_calls == 1
    assert send_calls == 2


@pytest.mark.asyncio
async def test_eskiz_sms_sender_retries_on_expired_token_401(monkeypatch):
    monkeypatch.setattr(settings, "ESKIZ_EMAIL", "test@example.com")
    monkeypatch.setattr(settings, "ESKIZ_PASSWORD", "secret")
    monkeypatch.setattr(settings, "ESKIZ_SENDER", "4546")

    login_calls = 0
    send_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal login_calls, send_calls
        if request.url.path.endswith("/auth/login"):
            login_calls += 1
            return httpx.Response(200, json={"data": {"token": "token-fresh"}})
        if request.url.path.endswith("/message/sms/send"):
            send_calls += 1
            if request.headers.get("Authorization") == "Bearer token-expired":
                # First attempt with old token expires
                return httpx.Response(401, json={"message": "Token expired"})
            if request.headers.get("Authorization") == "Bearer token-fresh":
                # Second attempt with refreshed token succeeds
                return httpx.Response(200, json={"status": "waiting"})
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://notify.eskiz.uz/api")
    sender = EskizSmsSender(client=client)
    sender._token = "token-expired"  # Preload expired token

    await sender.send("998901234567", "Test code: 3333")
    assert login_calls == 1  # Re-login triggered
    assert send_calls == 2   # 401 then retry


@pytest.mark.asyncio
async def test_eskiz_sms_sender_raises_sms_unavailable_on_error(monkeypatch):
    monkeypatch.setattr(settings, "ESKIZ_EMAIL", "test@example.com")
    monkeypatch.setattr(settings, "ESKIZ_PASSWORD", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/login"):
            return httpx.Response(500, json={"message": "Internal error"})
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://notify.eskiz.uz/api")
    sender = EskizSmsSender(client=client)

    with pytest.raises(SmsUnavailable):
        await sender.send("998901234567", "Test code: 4444")


@pytest.mark.asyncio
async def test_deliver_sms_swallows_failure_in_background(monkeypatch):
    class FailingSender:
        async def send(self, phone: str, message: str) -> None:
            raise RuntimeError("Network down")

    set_sms_sender(FailingSender())

    # deliver_sms must not raise
    await deliver_sms(OutgoingSms(phone="+998901234567", message="Code: 5555"))


def test_get_sms_sender_configuration(monkeypatch):
    monkeypatch.setattr(settings, "SMS_PROVIDER", "disabled")
    set_sms_sender(None)
    with pytest.raises(SmsUnavailable):
        get_sms_sender()

    monkeypatch.setattr(settings, "SMS_PROVIDER", "console")
    set_sms_sender(None)
    sender = get_sms_sender()
    assert isinstance(sender, ConsoleSmsSender)

    monkeypatch.setattr(settings, "SMS_PROVIDER", "eskiz")
    set_sms_sender(None)
    sender = get_sms_sender()
    assert isinstance(sender, EskizSmsSender)
