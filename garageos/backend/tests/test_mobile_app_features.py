"""Mobile app round 2: background SMS, send limits, phone sign-in, Telegram
retirement, Expo push, photo uploads."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.config import Settings, settings
from app.core.database import async_session_factory
from app.models import PushDevice, VerificationCode
from app.services import push
from tests.test_customer_mobile_accounts import (  # noqa: F401
    NEW_PASSWORD, _bearer, _garage_customer, _signup, sms_box,
)
from tests.test_production_config import VALID
from tests.test_staff_access_lifecycle import PASSWORD, client, identity  # noqa: F401
from tests.test_staff_management_api import owner  # noqa: F401

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest_asyncio.fixture
async def app_customer(client, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)
    tokens = (await _signup(client, sms_box, phone, email)).json()
    return {"id": customer_id, "phone": phone, "email": email, "headers": _bearer(tokens)}


# ── SMS delivery and limits ────────────────────────────────────────────────
async def test_gateway_failure_still_answers_like_no_match(client, identity, owner, sms_box, monkeypatch):
    _, phone, email = await _garage_customer(client, owner)

    async def broken(phone, message):
        raise RuntimeError("gateway down")
    monkeypatch.setattr(sms_box, "send", broken)
    response = await client.post("/api/v1/customer/auth/signup/start", json={"email": email, "phone": phone})
    # The code was issued and the SMS left in the background: same 202 as a miss.
    assert response.status_code == 202
    async with async_session_factory() as session:
        assert await session.scalar(select(VerificationCode).where(VerificationCode.email == email))


async def test_code_requests_are_limited_per_email(client, identity, owner, sms_box, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    _, phone, email = await _garage_customer(client, owner)
    statuses = [(await client.post("/api/v1/customer/auth/signup/start",
                                   json={"email": email, "phone": phone})).status_code
                for _ in range(settings.VERIFICATION_SEND_MAX + 1)]
    assert statuses == [202] * settings.VERIFICATION_SEND_MAX + [429]
    assert len(sms_box.sent) == settings.VERIFICATION_SEND_MAX


# ── phone sign-in and reset ────────────────────────────────────────────────
async def test_sign_in_with_phone_in_any_format(client, app_customer):
    for phone in (app_customer["phone"], "+998 " + app_customer["phone"][3:], app_customer["phone"][3:]):
        r = await client.post("/api/v1/customer/auth/login", json={"phone": phone, "password": PASSWORD})
        assert r.status_code == 200, (phone, r.text)
        assert r.json()["customer"]["id"] == app_customer["id"]
    wrong = await client.post("/api/v1/customer/auth/login",
                              json={"phone": app_customer["phone"], "password": "wrong-password-1"})
    assert wrong.status_code == 401
    both = await client.post("/api/v1/customer/auth/login", json={
        "phone": app_customer["phone"], "email": app_customer["email"], "password": PASSWORD})
    assert both.status_code == 422


async def test_reset_password_by_phone(client, app_customer, sms_box):
    start = await client.post("/api/v1/customer/auth/password/reset/start", json={"phone": app_customer["phone"]})
    assert start.status_code == 202 and sms_box.sent[-1][0] == app_customer["phone"]
    done = await client.post("/api/v1/customer/auth/password/reset/complete", json={
        "phone": app_customer["phone"], "code": sms_box.last_code(), "new_password": NEW_PASSWORD})
    assert done.status_code == 200, done.text
    assert (await client.post("/api/v1/customer/auth/login", json={
        "phone": app_customer["phone"], "password": NEW_PASSWORD})).status_code == 200


# ── Telegram sign-in is gone ───────────────────────────────────────────────
@pytest.mark.parametrize("path", ["/api/v1/customer/auth/telegram", "/api/v1/customer/auth/link",
                                  "/api/v1/customer/auth/dev"])
async def test_telegram_sign_in_routes_are_removed(client, path):
    assert (await client.post(path, json={"init_data": "x"})).status_code in (404, 405)


# ── push notifications ─────────────────────────────────────────────────────
class RecordingPush:
    def __init__(self, gone=()):
        self.sent, self.gone = [], list(gone)

    async def send(self, tokens, message):
        self.sent.append((tokens, message))
        return [t for t in tokens if t in self.gone]


@pytest_asyncio.fixture
async def push_box(monkeypatch):
    box = RecordingPush()
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "console")
    push.set_push_sender(box)
    push.register_push_handlers()
    yield box
    await push.drain()
    push.set_push_sender(None)


def _token():
    return f"ExponentPushToken[{uuid.uuid4().hex}]"


async def test_garage_reply_pushes_to_registered_devices(client, owner, app_customer, push_box):
    token = _token()
    registered = await client.post("/api/v1/customer/devices", headers=app_customer["headers"],
                                   json={"token": token, "platform": "ios"})
    assert registered.status_code == 200, registered.text
    thread = await client.post("/api/v1/conversations", headers=owner,
                               json={"subject": "Your car", "customer_id": app_customer["id"]})
    assert thread.status_code == 201, thread.text
    conversation = thread.json()["id"]

    reply = await client.post(f"/api/v1/conversations/{conversation}/messages", headers=owner,
                              json={"body": "Your car is ready for pickup"})
    assert reply.status_code == 201, reply.text
    await push.drain()
    assert push_box.sent and push_box.sent[-1][0] == [token]
    assert push_box.sent[-1][1].data == {"type": "conversation", "id": conversation}

    count = len(push_box.sent)
    note = await client.post(f"/api/v1/conversations/{conversation}/messages", headers=owner,
                             json={"body": "internal: check brakes", "kind": "note"})
    assert note.status_code == 201
    own = await client.post(f"/api/v1/customer/messages/{conversation}", headers=app_customer["headers"],
                            json={"body": "Thanks!"})
    assert own.status_code == 200, own.text
    await push.drain()
    assert len(push_box.sent) == count  # internal notes and the customer's own words stay silent


async def test_unregistered_devices_are_dropped(client, app_customer, push_box):
    token = _token()
    await client.post("/api/v1/customer/devices", headers=app_customer["headers"],
                      json={"token": token, "platform": "android"})
    push_box.gone.append(token)
    await push.deliver(push.PushIntent(push.PushMessage("Hi"), customer_id=uuid.UUID(app_customer["id"])))
    async with async_session_factory() as session:
        assert await session.scalar(select(PushDevice).where(PushDevice.token == token)) is None


async def test_device_moves_with_sign_in_and_is_removed_on_delete(client, owner, app_customer, sms_box):
    token = _token()
    await client.post("/api/v1/customer/devices", headers=app_customer["headers"],
                      json={"token": token, "platform": "ios"})
    other_id, phone, email = await _garage_customer(client, owner)
    other = _bearer((await _signup(client, sms_box, phone, email)).json())
    await client.post("/api/v1/customer/devices", headers=other, json={"token": token, "platform": "ios"})
    async with async_session_factory() as session:
        row = await session.scalar(select(PushDevice).where(PushDevice.token == token))
        assert str(row.customer_id) == other_id
    assert (await client.post("/api/v1/customer/devices", headers=other,
                              json={"token": "not-a-token", "platform": "ios"})).status_code == 422
    deleted = await client.request("DELETE", "/api/v1/customer/me", headers=other, json={"password": PASSWORD})
    assert deleted.status_code == 200
    async with async_session_factory() as session:
        assert await session.scalar(select(PushDevice).where(PushDevice.token == token)) is None


# ── photo uploads ──────────────────────────────────────────────────────────
@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


async def _upload(client, headers, data, path="/api/v1/customer/files", name="photo.jpg"):
    return await client.post(path, headers=headers, files={"file": (name, data, "image/jpeg")})


async def test_customer_uploads_and_shares_photo_in_a_message(client, owner, app_customer, sms_box, upload_dir):
    up = await _upload(client, app_customer["headers"], JPEG)
    assert up.status_code == 201, up.text
    photo = up.json()
    assert photo["content_type"] == "image/jpeg" and photo["url"] == f"/api/v1/customer/files/{photo['id']}"
    got = await client.get(photo["url"], headers=app_customer["headers"])
    assert got.status_code == 200 and got.content == JPEG

    # Another customer cannot read or attach it.
    _, phone, email = await _garage_customer(client, owner)
    stranger = _bearer((await _signup(client, sms_box, phone, email)).json())
    assert (await client.get(photo["url"], headers=stranger)).status_code == 404

    thread = await client.post("/api/v1/conversations", headers=owner, json={"customer_id": app_customer["id"]})
    conversation = thread.json()["id"]
    sent = await client.post(f"/api/v1/customer/messages/{conversation}", headers=app_customer["headers"],
                             json={"attachments": [{"file_id": photo["id"], "label": "Dashboard"}]})
    assert sent.status_code == 200, sent.text
    assert sent.json()["attachments"][0]["url"] == photo["url"]

    # Staff of the garage see it on their own route.
    staff_url = f"/api/v1/files/{photo['id']}"
    staff_thread = await client.get(f"/api/v1/conversations/{conversation}", headers=owner)
    assert staff_url in staff_thread.text
    assert (await client.get(staff_url, headers=owner)).content == JPEG

    stolen = await client.post(f"/api/v1/customer/messages/{conversation}", headers=stranger,
                               json={"attachments": [{"file_id": photo["id"]}]})
    assert stolen.status_code == 404


async def test_staff_photo_sent_to_customer_is_downloadable_by_them(client, owner, app_customer, upload_dir):
    up = await _upload(client, owner, PNG, path="/api/v1/files", name="x.png")
    assert up.status_code == 201, up.text
    photo = up.json()
    thread = await client.post("/api/v1/conversations", headers=owner, json={"customer_id": app_customer["id"]})
    conversation = thread.json()["id"]
    customer_url = f"/api/v1/customer/files/{photo['id']}"
    assert (await client.get(customer_url, headers=app_customer["headers"])).status_code == 404
    await client.post(f"/api/v1/conversations/{conversation}/messages", headers=owner, json={
        "body": "Here is the part", "attachments": [{"kind": "photo", "label": "Part", "url": photo["url"]}]})
    view = await client.get(f"/api/v1/customer/messages/{conversation}", headers=app_customer["headers"])
    assert customer_url in view.text
    got = await client.get(customer_url, headers=app_customer["headers"])
    assert got.status_code == 200 and got.content == PNG


async def test_uploads_reject_non_images_and_oversize(client, app_customer, upload_dir, monkeypatch):
    bad = await _upload(client, app_customer["headers"], b"%PDF-1.7 not an image", name="evil.jpg")
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
    monkeypatch.setattr(settings, "UPLOAD_MAX_BYTES", 32)
    big = await _upload(client, app_customer["headers"], JPEG)
    assert big.status_code == 413
    assert not any(p.suffix == ".part" for p in upload_dir.rglob("*"))


@pytest.mark.parametrize("changes", [{"PUSH_PROVIDER": "console"}, {"UPLOAD_DIR": "uploads"}])
def test_deployments_reject_unsafe_push_and_upload_config(changes):
    with pytest.raises(ValueError):
        Settings(_env_file=None, **{**VALID, **changes})
