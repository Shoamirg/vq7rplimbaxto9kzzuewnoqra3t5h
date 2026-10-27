"""Comprehensive tests for customer push notification subsystem and Expo sender."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.events import (
    AppointmentCancelled,
    AppointmentCompleted,
    AppointmentConfirmed,
    AppointmentCreated,
    AppointmentStarted,
    CaseStatusChanged,
    EstimateSent,
    InvoiceIssued,
    InvoicePaid,
    MaintenanceDue,
    MessagePosted,
    event_bus,
)
from app.models.appointment import Appointment, AppointmentStatus
from app.models.push_device import PushDevice
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.services import push
from app.services.push import (
    ConsolePushSender,
    ExpoPushSender,
    PushIntent,
    PushMessage,
    customer_push_for,
    deliver,
    drain,
    get_push_sender,
    on_event,
    register_push_handlers,
    set_push_sender,
)
from tests.test_customer_mobile_accounts import (
    _bearer,
    _garage_customer,
    _signup,
    sms_box,
)
from tests.test_staff_access_lifecycle import (  # noqa: F401
    PASSWORD,
    client,
    identity,
)
from tests.test_staff_management_api import owner  # noqa: F401


@pytest_asyncio.fixture(autouse=True)
async def cleanup_push_and_engine():
    set_push_sender(None)
    yield
    set_push_sender(None)
    await engine.dispose()


def _token() -> str:
    return f"ExponentPushToken[{uuid.uuid4().hex}]"


# ── 1. customer_push_for Intent Mapping Tests ─────────────────────────────────

def test_customer_push_for_appointment_confirmed():
    appt_id = uuid.uuid4()
    cust_id = uuid.uuid4()
    veh_id = uuid.uuid4()
    event = AppointmentConfirmed(appointment_id=appt_id, customer_id=cust_id, vehicle_id=veh_id)
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id == cust_id
    assert intent.appointment_id is None
    assert intent.message.title == "Appointment confirmed"
    assert intent.message.body is None
    assert intent.message.data == {"type": "appointment", "id": str(appt_id)}


def test_customer_push_for_appointment_completed():
    appt_id = uuid.uuid4()
    event = AppointmentCompleted(appointment_id=appt_id, vehicle_label="Malibu 01 777 AAA")
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id is None
    assert intent.appointment_id == appt_id
    assert intent.message.title == "Your car is ready"
    assert intent.message.body == "Malibu 01 777 AAA"
    assert intent.message.data == {"type": "appointment", "id": str(appt_id)}


def test_customer_push_for_appointment_cancelled():
    appt_id = uuid.uuid4()
    event = AppointmentCancelled(appointment_id=appt_id, reason="Client rescheduled")
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id is None
    assert intent.appointment_id == appt_id
    assert intent.message.title == "Appointment cancelled"
    assert intent.message.body == "Client rescheduled"
    assert intent.message.data == {"type": "appointment", "id": str(appt_id)}


def test_customer_push_for_estimate_sent():
    inv_id = uuid.uuid4()
    cust_id = uuid.uuid4()
    event = EstimateSent(service_center_id=uuid.uuid4(), invoice_id=inv_id, code="EST-2026-001", customer_id=cust_id)
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id == cust_id
    assert intent.message.title == "New estimate to review"
    assert intent.message.body == "EST-2026-001"
    assert intent.message.data == {"type": "estimate", "id": str(inv_id)}


def test_customer_push_for_invoice_issued():
    inv_id = uuid.uuid4()
    cust_id = uuid.uuid4()
    event = InvoiceIssued(service_center_id=uuid.uuid4(), invoice_id=inv_id, code="INV-2026-001", customer_id=cust_id)
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id == cust_id
    assert intent.message.title == "New invoice"
    assert intent.message.body == "INV-2026-001"
    assert intent.message.data == {"type": "invoice", "id": str(inv_id)}


def test_customer_push_for_case_status_changed():
    case_id = uuid.uuid4()
    cust_id = uuid.uuid4()
    event = CaseStatusChanged(service_center_id=uuid.uuid4(), case_id=case_id, code="CS-1",
                              status="tow_dispatched", customer_id=cust_id)
    intent = customer_push_for(event)

    assert intent is not None
    assert intent.customer_id == cust_id
    assert intent.message.title == "Roadside update"
    assert intent.message.body == "Tow dispatched"
    assert intent.message.data == {"type": "case", "id": str(case_id)}

    # Without customer_id -> should return None
    event_anon = CaseStatusChanged(service_center_id=uuid.uuid4(), case_id=case_id, code="CS-2",
                                   status="pending", customer_id=None)
    assert customer_push_for(event_anon) is None


def test_customer_push_for_message_posted():
    conv_id = uuid.uuid4()
    cust_id = uuid.uuid4()

    # Staff to customer -> triggers push
    staff_msg = MessagePosted(service_center_id=uuid.uuid4(), conversation_id=conv_id, message_id=uuid.uuid4(),
                              channel="mobile", preview="Your brake pads are replaced",
                              author_role="mechanic", author_name="Alisher", customer_id=cust_id)
    intent = customer_push_for(staff_msg)
    assert intent is not None
    assert intent.customer_id == cust_id
    assert intent.message.title == "Alisher"
    assert intent.message.body == "Your brake pads are replaced"
    assert intent.message.data == {"type": "conversation", "id": str(conv_id)}

    # Customer's own reply -> None
    cust_msg = MessagePosted(service_center_id=uuid.uuid4(), conversation_id=conv_id, message_id=uuid.uuid4(),
                             channel="mobile", preview="Thank you!",
                             author_role="customer", author_name="Customer", customer_id=cust_id)
    assert customer_push_for(cust_msg) is None

    # Internal note -> None
    note_msg = MessagePosted(service_center_id=uuid.uuid4(), conversation_id=conv_id, message_id=uuid.uuid4(),
                             channel="internal", preview="Internal note: inspect rotors",
                             author_role="admin", is_internal=True, customer_id=cust_id)
    assert customer_push_for(note_msg) is None

    # Missing customer_id -> None
    no_cust = MessagePosted(service_center_id=uuid.uuid4(), conversation_id=conv_id, message_id=uuid.uuid4(),
                            channel="mobile", preview="System ping",
                            author_role="admin", customer_id=None)
    assert customer_push_for(no_cust) is None


def test_customer_push_for_unrelated_events():
    for ev in [
        AppointmentCreated(customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4(),
                           appointment_id=uuid.uuid4(), service_center_id=uuid.uuid4()),
        AppointmentStarted(appointment_id=uuid.uuid4(), service_center_id=uuid.uuid4()),
        MaintenanceDue(vehicle_id=uuid.uuid4(), customer_id=uuid.uuid4(),
                       service_type="brakes", due_km=5000,
                       service_center_id=uuid.uuid4()),
        InvoicePaid(service_center_id=uuid.uuid4(), invoice_id=uuid.uuid4(),
                    code="INV-100", customer_id=uuid.uuid4()),
    ]:
        assert customer_push_for(ev) is None


# ── 2. Push Sender Implementation Tests ───────────────────────────────────────

@pytest.mark.asyncio
async def test_console_push_sender():
    sender = ConsolePushSender()
    tokens = [_token()]
    message = PushMessage(title="Test Title", body="Test Body", data={"id": "123"})

    gone = await sender.send(tokens, message)
    assert gone == []
    assert len(sender.sent) == 1
    assert sender.sent[0] == (tokens, message)


def test_get_push_sender_provider_switching(monkeypatch):
    set_push_sender(None)
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "disabled")
    assert get_push_sender() is None

    set_push_sender(None)
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "console")
    sender_console = get_push_sender()
    assert isinstance(sender_console, ConsolePushSender)

    set_push_sender(None)
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "expo")
    sender_expo = get_push_sender()
    assert isinstance(sender_expo, ExpoPushSender)

    # Overriding explicitly via set_push_sender
    override = ConsolePushSender()
    set_push_sender(override)
    assert get_push_sender() is override


@pytest.mark.asyncio
async def test_expo_push_sender_send_payload_and_auth(monkeypatch):
    monkeypatch.setattr(settings, "EXPO_ACCESS_TOKEN", "test-secret-token")
    monkeypatch.setattr(settings, "EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")

    recorded_requests: list[httpx.Request] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append(request)
        return httpx.Response(200, json={"data": [{"status": "ok", "id": "t1"}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
    sender = ExpoPushSender(client=client)

    token = _token()
    msg = PushMessage(title="Appointment Confirmed", body="Tomorrow at 10:00", data={"appt_id": "xyz"})
    gone = await sender.send([token], msg)

    assert gone == []
    assert len(recorded_requests) == 1
    req = recorded_requests[0]
    assert req.headers["Authorization"] == "Bearer test-secret-token"
    assert req.headers["Accept"] == "application/json"
    assert req.headers["Content-Type"] == "application/json"

    payload = json.loads(req.content)
    assert payload == [{
        "to": token,
        "title": "Appointment Confirmed",
        "body": "Tomorrow at 10:00",
        "data": {"appt_id": "xyz"},
        "sound": "default",
    }]


@pytest.mark.asyncio
async def test_expo_push_sender_batching():
    batches: list[list[dict]] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        batches.append(body)
        return httpx.Response(200, json={"data": [{"status": "ok"} for _ in body]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
    sender = ExpoPushSender(client=client)

    # 150 tokens should produce 2 requests: batch of 100 and batch of 50
    tokens = [f"ExponentPushToken[{i:025d}]" for i in range(150)]
    msg = PushMessage(title="Batch Test", body="Message")
    gone = await sender.send(tokens, msg)

    assert gone == []
    assert len(batches) == 2
    assert len(batches[0]) == 100
    assert len(batches[1]) == 50


@pytest.mark.asyncio
async def test_expo_push_sender_detects_unregistered_devices():
    tokens = [
        "ExponentPushToken[device-active-1]",
        "ExponentPushToken[device-uninstalled-2]",
        "ExponentPushToken[device-rate-limited-3]",
    ]

    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "data": [
                {"status": "ok", "id": "t1"},
                {
                    "status": "error",
                    "message": '"device-uninstalled-2" is not a registered push device',
                    "details": {"error": "DeviceNotRegistered"},
                },
                {
                    "status": "error",
                    "message": "MessageRateExceeded",
                    "details": {"error": "MessageRateExceeded"},
                },
            ]
        })

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
    sender = ExpoPushSender(client=client)

    gone = await sender.send(tokens, PushMessage(title="Test"))
    # Only DeviceNotRegistered should be in gone
    assert gone == ["ExponentPushToken[device-uninstalled-2]"]


@pytest.mark.asyncio
async def test_expo_push_sender_http_status_error():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, content=b"Bad Gateway")

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
    sender = ExpoPushSender(client=client)

    with pytest.raises(httpx.HTTPStatusError):
        await sender.send([_token()], PushMessage(title="Failing"))


# ── 3. Delivery Logic and Event Bus Wiring ────────────────────────────────────

@pytest.mark.asyncio
async def test_deliver_noop_when_provider_disabled(monkeypatch):
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "disabled")
    set_push_sender(None)

    # deliver should cleanly return without attempting database session or network
    await deliver(PushIntent(PushMessage(title="Disabled"), customer_id=uuid.uuid4()))


@pytest.mark.asyncio
async def test_deliver_survives_exceptions(monkeypatch):
    class BrokenSender:
        async def send(self, tokens, message):
            raise RuntimeError("Underlying push transport crashed")

    monkeypatch.setattr(settings, "PUSH_PROVIDER", "console")
    set_push_sender(BrokenSender())

    # deliver() MUST catch all exceptions so business logic is never interrupted
    await deliver(PushIntent(PushMessage(title="Crash Test"), customer_id=uuid.uuid4()))


@pytest.mark.asyncio
async def test_on_event_lifecycle(monkeypatch):
    box = ConsolePushSender()
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "console")
    set_push_sender(box)

    event = AppointmentConfirmed(appointment_id=uuid.uuid4(), customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4())
    on_event(event)

    await drain()
    assert len(push._tasks) == 0


def test_on_event_disabled_does_nothing(monkeypatch):
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "disabled")
    event = AppointmentConfirmed(appointment_id=uuid.uuid4(), customer_id=uuid.uuid4(), vehicle_id=uuid.uuid4())
    on_event(event)
    assert len(push._tasks) == 0


def test_register_push_handlers_is_idempotent():
    register_push_handlers()
    count_before = len(event_bus._handlers.get(AppointmentConfirmed, []))
    register_push_handlers()
    count_after = len(event_bus._handlers.get(AppointmentConfirmed, []))
    assert count_before == count_after


# ── 4. End-to-End API and Database Lifecycle Tests ────────────────────────────

@pytest_asyncio.fixture
async def app_customer(client, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)
    tokens = (await _signup(client, sms_box, phone, email)).json()
    return {"id": customer_id, "phone": phone, "email": email, "headers": _bearer(tokens)}


@pytest.mark.asyncio
async def test_customer_devices_register_and_unregister(client, app_customer):
    token = _token()
    headers = app_customer["headers"]

    # 1. Register device
    reg_res = await client.post("/api/v1/customer/devices", headers=headers,
                                json={"token": token, "platform": "android"})
    assert reg_res.status_code == 200
    assert reg_res.json() == {"ok": True}

    # Verify device exists in database
    async with async_session_factory() as session:
        row = await session.scalar(select(PushDevice).where(PushDevice.token == token))
        assert row is not None
        assert str(row.customer_id) == app_customer["id"]
        assert row.platform == "android"

    # 2. Unregister device via DELETE
    unreg_res = await client.request("DELETE", "/api/v1/customer/devices", headers=headers,
                                     json={"token": token})
    assert unreg_res.status_code == 200
    assert unreg_res.json() == {"ok": True}

    # Verify device was deleted from database
    async with async_session_factory() as session:
        assert await session.scalar(select(PushDevice).where(PushDevice.token == token)) is None


@pytest.mark.asyncio
async def test_customer_devices_validation(client, app_customer):
    headers = app_customer["headers"]

    # Invalid token format
    res_bad_token = await client.post("/api/v1/customer/devices", headers=headers,
                                      json={"token": "invalid_token", "platform": "ios"})
    assert res_bad_token.status_code == 422

    # Invalid platform
    token = _token()
    res_bad_platform = await client.post("/api/v1/customer/devices", headers=headers,
                                         json={"token": token, "platform": "web"})
    assert res_bad_platform.status_code == 422


@pytest.mark.asyncio
async def test_customer_devices_cross_customer_delete_isolation(client, owner, app_customer, sms_box):
    token = _token()
    # Customer A registers token
    await client.post("/api/v1/customer/devices", headers=app_customer["headers"],
                      json={"token": token, "platform": "ios"})

    # Customer B signs up
    _, phone_b, email_b = await _garage_customer(client, owner)
    tokens_b = (await _signup(client, sms_box, phone_b, email_b)).json()
    headers_b = _bearer(tokens_b)

    # Customer B attempts to delete Customer A's token
    del_res = await client.request("DELETE", "/api/v1/customer/devices", headers=headers_b,
                                   json={"token": token})
    assert del_res.status_code == 200

    # Token must STILL exist and belong to Customer A
    async with async_session_factory() as session:
        row = await session.scalar(select(PushDevice).where(PushDevice.token == token))
        assert row is not None
        assert str(row.customer_id) == app_customer["id"]

    # Cleanup
    async with async_session_factory() as session:
        await session.execute(delete(PushDevice).where(PushDevice.token == token))
        await session.commit()


@pytest.mark.asyncio
async def test_deliver_resolves_appointment_and_prunes_unregistered_devices(client, owner, app_customer, monkeypatch):
    token = _token()
    await client.post("/api/v1/customer/devices", headers=app_customer["headers"],
                      json={"token": token, "platform": "android"})

    # Get a vehicle model
    async with async_session_factory() as session:
        model = await session.scalar(select(VehicleModel).limit(1))
        customer_uuid = uuid.UUID(app_customer["id"])
        device = await session.scalar(select(PushDevice).where(PushDevice.token == token))
        sc_id = device.service_center_id

        # Create vehicle
        vehicle = Vehicle(
            service_center_id=sc_id,
            customer_id=customer_uuid,
            vehicle_model_id=model.id,
            vin=f"VIN{uuid.uuid4().hex[:14].upper()}",
            license_plate=f"01{uuid.uuid4().hex[:5].upper()}",
            year=2024,
            current_km=15000,
            engine_type="petrol",
            transmission="automatic",
        )
        session.add(vehicle)
        await session.flush()

        # Create appointment
        appt = Appointment(
            service_center_id=sc_id,
            customer_id=customer_uuid,
            vehicle_id=vehicle.id,
            appointment_date=datetime.now(timezone.utc),
            appointment_time="11:00",
            status=AppointmentStatus.CONFIRMED,
        )
        session.add(appt)
        await session.commit()
        appt_id = appt.id

    class MockGoneSender:
        def __init__(self):
            self.delivered: list[tuple[list[str], PushMessage]] = []

        async def send(self, tokens, message):
            self.delivered.append((list(tokens), message))
            # Return token as gone
            return [token]

    mock_sender = MockGoneSender()
    monkeypatch.setattr(settings, "PUSH_PROVIDER", "console")
    set_push_sender(mock_sender)

    # Fire AppointmentCompleted which ONLY has appointment_id (customer_id is None)
    event = AppointmentCompleted(appointment_id=appt_id, vehicle_label="Cobalt 01 A 777 AA")
    intent = customer_push_for(event)
    assert intent.customer_id is None
    assert intent.appointment_id == appt_id

    # deliver should query appointment, resolve customer_id, find token, deliver, and prune gone token
    await deliver(intent)

    assert len(mock_sender.delivered) == 1
    assert mock_sender.delivered[0][0] == [token]
    assert mock_sender.delivered[0][1].title == "Your car is ready"
    assert mock_sender.delivered[0][1].body == "Cobalt 01 A 777 AA"

    # Confirm device token was pruned from database
    async with async_session_factory() as session:
        assert await session.scalar(select(PushDevice).where(PushDevice.token == token)) is None
