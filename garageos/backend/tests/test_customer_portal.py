"""Customer auth + portal scoping.

Covers the full customer principal path: Telegram sign-in mints a customer
token, the token resolves back to the right customer, a staff-flavoured token is
refused, unlinked Telegram users 404, and ``/me`` returns only this customer's
own data (with a correct vehicle count and garage identity).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import urlencode

import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.exceptions import InvalidToken
from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.services.customer_auth_service import CustomerAuthService, TelegramNotLinked
from app.services.customer_portal_service import CustomerPortalService

BOT = "test-bot:portal"


@pytest.fixture(autouse=True)
def _bot_token(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", BOT)


def _init_data(telegram_id: int) -> str:
    fields = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": telegram_id, "username": "tg", "first_name": "Tg"}),
    }
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", BOT.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


async def _tenant(session, telegram_id: int | None, *, vehicles: int = 0) -> tuple:
    center = ServiceCenter(name="Portal Garage", brand_name="Portal Garage",
                           tagline="We fix things", email=f"pg-{uuid.uuid4().hex}@t.local")
    session.add(center)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Ahmed Khan",
                        phone=f"+1555{uuid.uuid4().int % 10_000_000:07d}",
                        telegram_id=telegram_id)
    session.add(customer)
    await session.flush()
    if vehicles:
        brand = Brand(name=f"B-{uuid.uuid4().hex[:8]}")
        session.add(brand)
        await session.flush()
        model = VehicleModel(brand_id=brand.id, name="M", year_start=2015)
        session.add(model)
        await session.flush()
        for _ in range(vehicles):
            session.add(Vehicle(service_center_id=center.id, customer_id=customer.id,
                                vehicle_model_id=model.id, year=2020, current_km=10000))
        await session.flush()
    return center, customer


def _svc(session) -> CustomerAuthService:
    uow = UnitOfWork()
    uow.session = session
    return CustomerAuthService(uow)


@pytest.mark.asyncio
async def test_telegram_sign_in_and_resolve(session):
    _, customer = await _tenant(session, telegram_id=910001)
    svc = _svc(session)

    tokens = await svc.authenticate_telegram(_init_data(910001))
    assert tokens["customer"]["id"] == str(customer.id)

    resolved = await svc.get_current_customer(tokens["access_token"])
    assert resolved.id == customer.id


@pytest.mark.asyncio
async def test_unlinked_telegram_user_is_rejected(session):
    await _tenant(session, telegram_id=910002)
    with pytest.raises(TelegramNotLinked):
        await _svc(session).authenticate_telegram(_init_data(999999))  # no such link


@pytest.mark.asyncio
async def test_staff_token_is_refused(session):
    # A well-formed *admin* access token must not satisfy customer resolution.
    admin_token = create_access_token(data={"sub": str(uuid.uuid4()), "type": "access"})
    with pytest.raises(InvalidToken):
        await _svc(session).get_current_customer(admin_token)


@pytest.mark.asyncio
async def test_refresh_issues_new_pair(session):
    _, customer = await _tenant(session, telegram_id=910003)
    svc = _svc(session)
    tokens = await svc.authenticate_telegram(_init_data(910003))
    refreshed = await svc.refresh(tokens["refresh_token"])
    assert refreshed["customer"]["id"] == str(customer.id)
    assert await svc.get_current_customer(refreshed["access_token"])


@pytest.mark.asyncio
async def test_link_by_phone(session):
    _, customer = await _tenant(session, telegram_id=None)  # unlinked
    svc = _svc(session)
    tokens = await svc.link_by_phone(_init_data(910004), customer.phone)
    assert tokens["customer"]["id"] == str(customer.id)
    await session.refresh(customer)
    assert customer.telegram_id == 910004


@pytest.mark.asyncio
async def test_me_returns_scoped_profile(session):
    center, customer = await _tenant(session, telegram_id=910005, vehicles=3)
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    me = await CustomerPortalService(uow, customer).me()
    assert me.full_name == "Ahmed Khan"
    assert me.vehicle_count == 3
    assert me.garage.name == "Portal Garage"
