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
import pytest_asyncio
from sqlalchemy import delete

from app.core.config import settings
from app.core.security import create_access_token
from app.exceptions import InvalidToken, NotFoundError
from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import RoadsideRequest
from app.services.customer_auth_service import CustomerAuthService, TelegramNotLinked
from app.services.customer_portal_service import CustomerPortalService

BOT = "test-bot:portal"


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_committed_auth_fixtures(session):
    # Session issuance deliberately commits before success. Remove ONLY this
    # module's owned identities, including when a test fails after issuance.
    try:
        yield
    finally:
        await session.rollback()
        centers = session.info.get("portal_fixture_centers", [])
        brands = session.info.get("portal_fixture_brands", [])
        if centers:
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id.in_(centers)))
        if brands:
            await session.execute(delete(VehicleModel).where(VehicleModel.brand_id.in_(brands)))
            await session.execute(delete(Brand).where(Brand.id.in_(brands)))
        await session.commit()


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
    session.info.setdefault("portal_fixture_centers", []).append(center.id)
    customer = Customer(service_center_id=center.id, full_name="Ahmed Khan",
                        phone=f"+1555{uuid.uuid4().int % 10_000_000:07d}",
                        telegram_id=telegram_id)
    session.add(customer)
    await session.flush()
    if vehicles:
        brand = Brand(name=f"B-{uuid.uuid4().hex[:8]}")
        session.add(brand)
        await session.flush()
        session.info.setdefault("portal_fixture_brands", []).append(brand.id)
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
async def test_link_by_phone_is_disabled_without_verified_invitation(session):
    _, customer = await _tenant(session, telegram_id=None)  # unlinked
    svc = _svc(session)
    with pytest.raises(NotFoundError):
        await svc.link_by_phone(_init_data(910004), customer.phone)
    await session.refresh(customer)
    assert customer.telegram_id is None


@pytest.mark.asyncio
async def test_me_returns_scoped_profile(session):
    center, customer = await _tenant(session, telegram_id=910005, vehicles=3)
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    me = await CustomerPortalService(uow, customer).me()
    assert me.full_name == "Ahmed Khan"
    assert me.vehicle_count == 3
    assert me.garage.name == "Portal Garage"


# ── ownership + composition (Phases C–G) ────────────────────────────────────

def _portal(session, center, customer) -> CustomerPortalService:
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return CustomerPortalService(uow, customer)


async def _add_vehicle(session, center, customer) -> Vehicle:
    brand = Brand(name=f"B-{uuid.uuid4().hex[:8]}")
    session.add(brand)
    await session.flush()
    session.info.setdefault("portal_fixture_brands", []).append(brand.id)
    model = VehicleModel(brand_id=brand.id, name="Land Cruiser", year_start=2015)
    session.add(model)
    await session.flush()
    v = Vehicle(service_center_id=center.id, customer_id=customer.id,
                vehicle_model_id=model.id, year=2021, current_km=42000,
                license_plate="A-1234")
    session.add(v)
    await session.flush()
    return v


@pytest.mark.asyncio
async def test_vehicle_ownership_is_enforced(session):
    from app.exceptions import VehicleNotFound

    center, alice = await _tenant(session, telegram_id=920001)
    _, bob = await _tenant(session, telegram_id=920002)
    bob.service_center_id = center.id  # same tenant, different customer
    await session.flush()
    bob_vehicle = await _add_vehicle(session, center, bob)

    # Alice must not be able to read Bob's vehicle passport/health.
    with pytest.raises(VehicleNotFound):
        await _portal(session, center, alice).vehicle_passport(bob_vehicle.id)
    with pytest.raises(VehicleNotFound):
        await _portal(session, center, alice).vehicle_health(bob_vehicle.id)


@pytest.mark.asyncio
async def test_billing_is_plain_and_scoped(session):
    center, customer = await _tenant(session, telegram_id=920003)
    billing = await _portal(session, center, customer).billing()
    # No invoices yet -> a clean, no-balance state (no payer score fields exist).
    assert billing.has_balance is False
    assert billing.balance_due == 0.0
    assert "commercial_health" not in billing.model_dump()


@pytest.mark.asyncio
async def test_roadside_opens_case_and_conversation(session):
    center, customer = await _tenant(session, telegram_id=920004)
    vehicle = await _add_vehicle(session, center, customer)
    portal = _portal(session, center, customer)

    case = await portal.create_roadside(
        RoadsideRequest(description="Flat tyre on the highway",
                        vehicle_id=str(vehicle.id), location_text="Route 7")
    )
    assert case.code.startswith("OPS-") or case.code  # a real case code was minted
    assert case.status == "new"
    assert case.conversation_id  # dispatcher thread exists
    # Stepper: first step current, none resolved yet.
    assert case.steps[0].current is True
    assert case.steps[-1].done is False

    # Status lookup returns the same case for the owner.
    again = await portal.roadside_status(uuid.UUID(case.id))
    assert again.code == case.code


@pytest.mark.asyncio
async def test_roadside_status_rejects_other_customer(session):
    from app.exceptions import NotFoundError

    center, alice = await _tenant(session, telegram_id=920005)
    _, bob = await _tenant(session, telegram_id=920006)
    bob.service_center_id = center.id
    await session.flush()
    bob_case = await _portal(session, center, bob).create_roadside(
        RoadsideRequest(description="Won't start")
    )
    with pytest.raises(NotFoundError):
        await _portal(session, center, alice).roadside_status(uuid.UUID(bob_case.id))


@pytest.mark.asyncio
async def test_thread_excludes_internal_notes(session):
    from app.models.conversation import Channel, MessageKind, ParticipantRole
    from app.services.conversation_service import ConversationService

    center, customer = await _tenant(session, telegram_id=920007)
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    convs = ConversationService(uow)
    thread = await convs.create_conversation(subject="Brake noise", customer_id=customer.id)
    conv_id = uuid.UUID(thread["id"])
    await convs.post_message(conv_id, body="Customer-visible reply",
                             channel=Channel.WEB, author_role=ParticipantRole.DISPATCHER,
                             author_name="Dispatcher")
    await convs.post_message(conv_id, body="Internal staff note",
                             author_role=ParticipantRole.DISPATCHER, author_name="Dispatcher",
                             kind=MessageKind.NOTE)

    out = await _portal(session, center, customer).thread(conv_id)
    bodies = [m.body for m in out.messages]
    assert "Customer-visible reply" in bodies
    assert "Internal staff note" not in bodies


async def _estimate(session, center, customer, vehicle) -> str:
    from app.models.invoice import InvoiceKind
    from app.services.invoice_service import InvoiceService

    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    doc = await InvoiceService(uow).create(
        kind=InvoiceKind.ESTIMATE, customer_id=customer.id, vehicle_id=vehicle.id,
        line_items=[{"kind": "labor", "description": "Brake job", "quantity": 1,
                     "unit_price": 376.0, "taxable": True}],
    )
    return doc["id"]


@pytest.mark.asyncio
async def test_estimate_approve_decline_and_ownership(session):
    from app.exceptions import NotFoundError
    from app.models.invoice import InvoiceStatus

    center, customer = await _tenant(session, telegram_id=930001)
    v = await _add_vehicle(session, center, customer)
    est_id = await _estimate(session, center, customer, v)

    approved = await _portal(session, center, customer).approve_estimate(uuid.UUID(est_id))
    assert approved.status == InvoiceStatus.APPROVED

    # A second customer cannot approve/decline this estimate.
    _, mallory = await _tenant(session, telegram_id=930002)
    mallory.service_center_id = center.id
    await session.flush()
    with pytest.raises(NotFoundError):
        await _portal(session, center, mallory).decline_estimate(uuid.UUID(est_id))


@pytest.mark.asyncio
async def test_estimate_question_opens_thread(session):
    center, customer = await _tenant(session, telegram_id=930003)
    v = await _add_vehicle(session, center, customer)
    est_id = await _estimate(session, center, customer, v)
    portal = _portal(session, center, customer)

    ask = await portal.ask_estimate_question(uuid.UUID(est_id), "Can you explain the brake charge?")
    thread = await portal.thread(uuid.UUID(ask.conversation_id))
    assert any(m.from_me and "brake charge" in (m.body or "") for m in thread.messages)


@pytest.mark.asyncio
async def test_roadside_attachment_lands_in_thread(session):
    from app.schemas.customer_portal import RoadsideAttachmentRequest

    center, customer = await _tenant(session, telegram_id=930004)
    await _add_vehicle(session, center, customer)
    portal = _portal(session, center, customer)

    case = await portal.create_roadside(RoadsideRequest(
        description="Won't start", location_lat=40.1, location_lng=-74.2,
        location_text="Route 7",
    ))
    # The shared location was auto-attached to the dispatcher thread.
    thread = await portal.thread(uuid.UUID(case.conversation_id))
    assert any(a.kind == "location" for m in thread.messages for a in m.attachments)

    # A follow-up voice note attaches too.
    await portal.add_roadside_attachment(uuid.UUID(case.id), RoadsideAttachmentRequest(
        kind="voice", label="Voice note", note="Sending a voice message",
    ))
    thread2 = await portal.thread(uuid.UUID(case.conversation_id))
    assert any(a.kind == "voice" for m in thread2.messages for a in m.attachments)


@pytest.mark.asyncio
async def test_home_aggregates(session):
    center, customer = await _tenant(session, telegram_id=920008)
    await _add_vehicle(session, center, customer)
    home = await _portal(session, center, customer).home()
    assert home.sos_available is True
    assert home.greeting == "Ahmed"
    assert home.garage.name == "Portal Garage"
    assert home.primary_vehicle is not None


@pytest.mark.asyncio
async def test_home_with_upcoming_appointment(session):
    # Regression: Appointment has no `service_type` column (it's derived from the
    # maintenance rule). Home must not blow up when a customer has an appointment.
    from datetime import datetime, timedelta, timezone

    from app.models.appointment import Appointment

    center, customer = await _tenant(session, telegram_id=920009)
    v = await _add_vehicle(session, center, customer)
    session.add(Appointment(
        service_center_id=center.id, customer_id=customer.id, vehicle_id=v.id,
        appointment_date=datetime.now(timezone.utc) + timedelta(days=3),
        appointment_time="10:00", status="confirmed",
    ))
    await session.flush()

    home = await _portal(session, center, customer).home()
    assert home.next_appointment is not None
    assert home.next_appointment.status == "confirmed"
