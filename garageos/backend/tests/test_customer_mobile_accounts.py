"""Mobile customer accounts: SMS sign-up, password reset/change, deletion,
sliding sessions, and the full portal for password customers."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, update

from app.core.config import Settings, settings
from app.core.database import async_session_factory
from app.models import AuthSession, Customer, Invoice, ServiceCenter
from app.models.customer_account import CustomerAccount
from app.services import sms
from tests.test_production_config import VALID
from tests.test_staff_access_lifecycle import client, identity, PASSWORD  # noqa: F401
from tests.test_staff_management_api import owner  # noqa: F401

NEW_PASSWORD = "Mobile-new-password-2026"


class RecordingSms:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send(self, phone, message):
        self.sent.append((phone, message))

    def last_code(self):
        return re.search(r"\d{6}", self.sent[-1][1]).group()


@pytest_asyncio.fixture
async def sms_box(monkeypatch):
    box = RecordingSms()
    monkeypatch.setattr(settings, "SMS_PROVIDER", "console")
    sms.set_sms_sender(box)
    yield box
    sms.set_sms_sender(None)


def _phone():
    return "998" + str(uuid.uuid4().int)[:9]


async def _garage_customer(client, owner, phone=None, email=None):
    phone = phone or _phone()
    email = email or f"mobile-{uuid.uuid4().hex}@example.com"
    created = await client.post("/api/v1/customers", headers=owner,
                                json={"full_name": "Mobil Mijoz", "phone": phone, "email": email})
    assert created.status_code == 201, created.text
    return created.json()["id"], phone, email


async def _signup(client, sms_box, phone, email, **extra):
    start = await client.post("/api/v1/customer/auth/signup/start", json={"email": email, "phone": phone})
    assert start.status_code == 202, start.text
    return await client.post("/api/v1/customer/auth/signup/complete", json={
        "email": email, "phone": phone, "code": sms_box.last_code(), "password": PASSWORD, **extra})


def _bearer(tokens):
    return {"Authorization": "Bearer " + tokens["access_token"]}


async def test_signup_requires_matching_record_and_sms_code(client, identity, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)

    # Wrong email for that phone: same answer, but nothing is sent.
    miss = await client.post("/api/v1/customer/auth/signup/start",
                             json={"email": "someone-else@example.com", "phone": phone})
    assert miss.status_code == 202 and sms_box.sent == []

    # Garage typed the number with the country code; the user types it without.
    start = await client.post("/api/v1/customer/auth/signup/start",
                              json={"email": email.upper(), "phone": "+998 " + phone[3:]})
    assert start.status_code == 202 and len(sms_box.sent) == 1
    assert sms_box.sent[0][0] == phone

    wrong = await client.post("/api/v1/customer/auth/signup/complete", json={
        "email": email, "phone": phone, "code": "000000" if sms_box.last_code() != "000000" else "111111",
        "password": PASSWORD})
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "INVALID_VERIFICATION_CODE"

    done = await client.post("/api/v1/customer/auth/signup/complete", json={
        "email": email, "phone": phone, "code": sms_box.last_code(), "password": PASSWORD})
    assert done.status_code == 201, done.text
    tokens = done.json()
    assert tokens["customer"]["id"] == customer_id

    headers = _bearer(tokens)
    for path in ["/api/v1/customer/me", "/api/v1/customer/home", "/api/v1/customer/billing",
                 "/api/v1/customer/messages"]:
        assert (await client.get(path, headers=headers)).status_code == 200, path

    login = await client.post("/api/v1/customer/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200

    # The code is single use and the record now has a login: no further codes.
    again = await client.post("/api/v1/customer/auth/signup/complete", json={
        "email": email, "phone": phone, "code": sms_box.last_code(), "password": PASSWORD})
    assert again.status_code == 400
    await client.post("/api/v1/customer/auth/signup/start", json={"email": email, "phone": phone})
    assert len(sms_box.sent) == 1


async def test_code_locks_after_too_many_wrong_guesses(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    await client.post("/api/v1/customer/auth/signup/start", json={"email": email, "phone": phone})
    code = sms_box.last_code()
    wrong = f"{(int(code) + 1) % 10**6:06d}"
    for _ in range(settings.VERIFICATION_CODE_MAX_ATTEMPTS):
        r = await client.post("/api/v1/customer/auth/signup/complete", json={
            "email": email, "phone": phone, "code": wrong, "password": PASSWORD})
        assert r.status_code == 400
    late = await client.post("/api/v1/customer/auth/signup/complete", json={
        "email": email, "phone": phone, "code": code, "password": PASSWORD})
    assert late.status_code == 400


async def test_same_details_at_two_garages_ask_which_one(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    async with async_session_factory() as session:
        other = ServiceCenter(name=f"Ikkinchi servis {uuid.uuid4().hex[:6]}")
        session.add(other)
        await session.flush()
        session.add(Customer(service_center_id=other.id, full_name="Mobil Mijoz", phone=phone, email=email))
        await session.commit()
        other_id = other.id
    try:
        choose = await _signup(client, sms_box, phone, email)
        assert choose.status_code == 409
        garages = choose.json()["error"]["garages"]
        assert {g["service_center_id"] for g in garages} == {str(identity["center"]), str(other_id)}
        picked = await client.post("/api/v1/customer/auth/signup/complete", json={
            "email": email, "phone": phone, "code": sms_box.last_code(), "password": PASSWORD,
            "service_center_id": str(other_id)})
        assert picked.status_code == 201, picked.text
        assert picked.json()["customer"]["service_center_id"] == str(other_id)
    finally:
        async with async_session_factory() as session:
            await session.execute(ServiceCenter.__table__.delete().where(ServiceCenter.id == other_id))
            await session.commit()


async def test_password_reset_signs_out_everywhere(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    tokens = (await _signup(client, sms_box, phone, email)).json()

    start = await client.post("/api/v1/customer/auth/password/reset/start", json={"email": email})
    assert start.status_code == 202 and sms_box.sent[-1][0] == phone
    unknown = await client.post("/api/v1/customer/auth/password/reset/start",
                                json={"email": "nobody-here@example.com"})
    assert unknown.status_code == 202 and len(sms_box.sent) == 2

    done = await client.post("/api/v1/customer/auth/password/reset/complete", json={
        "email": email, "code": sms_box.last_code(), "new_password": NEW_PASSWORD})
    assert done.status_code == 200, done.text
    assert (await client.get("/api/v1/customer/me", headers=_bearer(tokens))).status_code == 401
    assert (await client.post("/api/v1/customer/auth/refresh",
                              json={"refresh_token": tokens["refresh_token"]})).status_code == 401
    assert (await client.post("/api/v1/customer/auth/login",
                              json={"email": email, "password": PASSWORD})).status_code == 401
    assert (await client.post("/api/v1/customer/auth/login",
                              json={"email": email, "password": NEW_PASSWORD})).status_code == 200


async def test_change_password_keeps_this_device_only(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    first = (await _signup(client, sms_box, phone, email)).json()
    second = (await client.post("/api/v1/customer/auth/login",
                                json={"email": email, "password": PASSWORD})).json()
    bad = await client.post("/api/v1/customer/me/password", headers=_bearer(first),
                            json={"current_password": "not-the-password", "new_password": NEW_PASSWORD})
    assert bad.status_code == 401
    changed = await client.post("/api/v1/customer/me/password", headers=_bearer(first),
                                json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})
    assert changed.status_code == 200, changed.text
    assert (await client.get("/api/v1/customer/me", headers=_bearer(changed.json()))).status_code == 200
    for old in (first, second):
        assert (await client.get("/api/v1/customer/me", headers=_bearer(old))).status_code == 401


async def test_delete_account_anonymizes_but_keeps_invoices(client, identity, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)
    tokens = (await _signup(client, sms_box, phone, email)).json()
    async with async_session_factory() as session:
        invoice = Invoice(service_center_id=identity["center"], customer_id=uuid.UUID(customer_id),
                          code=f"DEL-{uuid.uuid4().hex[:6]}", kind="invoice", status="issued")
        session.add(invoice)
        await session.commit()
        invoice_id = invoice.id

    wrong = await client.request("DELETE", "/api/v1/customer/me", headers=_bearer(tokens),
                                 json={"password": "not-the-password"})
    assert wrong.status_code == 401
    missing = await client.request("DELETE", "/api/v1/customer/me", headers=_bearer(tokens))
    assert missing.status_code == 401
    deleted = await client.request("DELETE", "/api/v1/customer/me", headers=_bearer(tokens),
                                   json={"password": PASSWORD})
    assert deleted.status_code == 200, deleted.text

    assert (await client.get("/api/v1/customer/me", headers=_bearer(tokens))).status_code == 401
    assert (await client.post("/api/v1/customer/auth/login",
                              json={"email": email, "password": PASSWORD})).status_code == 401
    async with async_session_factory() as session:
        customer = await session.get(Customer, uuid.UUID(customer_id))
        assert customer.full_name == "Deleted customer" and not customer.is_active
        assert customer.phone is None and customer.email is None and customer.telegram_id is None
        assert await session.scalar(select(CustomerAccount).where(
            CustomerAccount.customer_id == customer.id)) is None
        assert await session.get(Invoice, invoice_id) is not None
    # The freed email cannot be re-attached: the record no longer carries it.
    await client.post("/api/v1/customer/auth/signup/start", json={"email": email, "phone": phone})
    assert len(sms_box.sent) == 1


async def test_customer_sessions_slide_within_absolute_cap(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    tokens = (await _signup(client, sms_box, phone, email)).json()
    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        row = await session.scalar(select(AuthSession).where(AuthSession.principal_kind == "customer")
                                   .order_by(AuthSession.created_at.desc()).limit(1))
        assert row.expires_at - now > timedelta(days=settings.CUSTOMER_REFRESH_IDLE_DAYS - 1)
        await session.execute(update(AuthSession).where(AuthSession.id == row.id)
                              .values(expires_at=now + timedelta(days=1)))
        await session.commit()
        session_id = row.id
    refreshed = await client.post("/api/v1/customer/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200, refreshed.text
    async with async_session_factory() as session:
        row = await session.get(AuthSession, session_id)
        assert row.expires_at - now > timedelta(days=settings.CUSTOMER_REFRESH_IDLE_DAYS - 1)
        # Near the absolute cap the window stops sliding.
        await session.execute(update(AuthSession).where(AuthSession.id == session_id).values(
            created_at=now - timedelta(days=settings.CUSTOMER_SESSION_MAX_DAYS - 2)))
        await session.commit()
    again = await client.post("/api/v1/customer/auth/refresh",
                              json={"refresh_token": refreshed.json()["refresh_token"]})
    assert again.status_code == 200
    async with async_session_factory() as session:
        row = await session.get(AuthSession, session_id)
        assert row.expires_at - now < timedelta(days=3)


async def test_draft_estimates_are_invisible_and_not_approvable(client, identity, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)
    headers = _bearer((await _signup(client, sms_box, phone, email)).json())
    async with async_session_factory() as session:
        draft = Invoice(service_center_id=identity["center"], customer_id=uuid.UUID(customer_id),
                        code=f"EST-{uuid.uuid4().hex[:6]}", kind="estimate", status="draft")
        session.add(draft)
        await session.commit()
        draft_id = draft.id
    billing = (await client.get("/api/v1/customer/billing", headers=headers)).json()
    assert all(doc["id"] != str(draft_id) for doc in billing["estimates"] + billing["invoices"])
    approve = await client.post(f"/api/v1/customer/billing/estimates/{draft_id}/approve", headers=headers)
    assert approve.status_code == 404


async def test_sms_disabled_answers_503(client, monkeypatch):
    monkeypatch.setattr(settings, "SMS_PROVIDER", "disabled")
    r = await client.post("/api/v1/customer/auth/signup/start",
                          json={"email": "x@example.com", "phone": _phone()})
    assert r.status_code == 503 and r.json()["error"]["code"] == "SMS_UNAVAILABLE"


@pytest.mark.parametrize("changes", [
    {"SMS_PROVIDER": "console"},
    {"SMS_PROVIDER": "eskiz"},
    {"SMS_PROVIDER": "eskiz", "ESKIZ_EMAIL": "ops@example.com", "ESKIZ_PASSWORD": "x",
     "SMS_CODE_TEMPLATE": "no placeholder"},
])
def test_deployments_reject_unsafe_sms_config(changes):
    with pytest.raises(ValueError):
        Settings(_env_file=None, **{**VALID, **changes})


def test_deployments_accept_eskiz_with_credentials():
    config = Settings(_env_file=None, **{**VALID, "SMS_PROVIDER": "eskiz",
                                         "ESKIZ_EMAIL": "ops@example.com", "ESKIZ_PASSWORD": "secret"})
    assert config.SMS_PROVIDER == "eskiz"
