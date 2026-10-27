"""Customer push notifications through the Expo Push API.

Business code never calls this: it emits domain events as before. After a Unit
of Work commits, the event bus hands each event to ``on_event``; events the
customer should hear about become a background delivery to every device the
customer registered. Delivery failures are logged and never affect the request.

Expo tickets with ``DeviceNotRegistered`` remove that token, so uninstalled
apps stop costing requests.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional, Protocol

import httpx
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.events import (
    AppointmentCancelled, AppointmentCompleted, AppointmentConfirmed, CaseStatusChanged,
    EstimateSent, InvoiceIssued, MessagePosted, event_bus,
)
from app.models.appointment import Appointment
from app.models.push_device import PushDevice

logger = logging.getLogger(__name__)
_EXPO_BATCH = 100


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: Optional[str] = None
    data: dict = field(default_factory=dict)


@dataclass(frozen=True)
class PushIntent:
    message: PushMessage
    customer_id: Optional[uuid.UUID] = None
    appointment_id: Optional[uuid.UUID] = None  # resolved to its customer at delivery


class PushSender(Protocol):
    async def send(self, tokens: list[str], message: PushMessage) -> list[str]:
        """Deliver; return the tokens Expo reports as no longer registered."""


class ConsolePushSender:
    def __init__(self):
        self.sent: list[tuple[list[str], PushMessage]] = []

    async def send(self, tokens, message):
        self.sent.append((list(tokens), message))
        logger.warning("Push (console provider) to %d device(s): %s", len(tokens), message.title)
        return []


class ExpoPushSender:
    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10)
        return self._client

    async def send(self, tokens, message):
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"
        gone: list[str] = []
        for start in range(0, len(tokens), _EXPO_BATCH):
            batch = tokens[start:start + _EXPO_BATCH]
            payload = [{"to": token, "title": message.title, "body": message.body,
                        "data": message.data, "sound": "default"} for token in batch]
            response = await self._http().post(settings.EXPO_PUSH_URL, json=payload, headers=headers)
            response.raise_for_status()
            for token, ticket in zip(batch, response.json().get("data", [])):
                if ticket.get("status") == "error":
                    if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                        gone.append(token)
                    else:
                        logger.warning("Expo push ticket error: %s", ticket.get("message"))
        return gone


_sender: Optional[PushSender] = None


def get_push_sender() -> Optional[PushSender]:
    global _sender
    if settings.PUSH_PROVIDER == "disabled":
        return None
    if _sender is None:
        _sender = ConsolePushSender() if settings.PUSH_PROVIDER == "console" else ExpoPushSender()
    return _sender


def set_push_sender(sender: Optional[PushSender]) -> None:
    """Swap the process sender (tests)."""
    global _sender
    _sender = sender


# ── which events reach the customer ────────────────────────────────────────
def customer_push_for(event) -> Optional[PushIntent]:
    def msg(title, body=None, **data):
        return PushMessage(title=title, body=body, data={k: str(v) for k, v in data.items() if v is not None})

    if isinstance(event, AppointmentConfirmed):
        return PushIntent(msg("Appointment confirmed", type="appointment", id=event.appointment_id),
                          customer_id=event.customer_id)
    if isinstance(event, AppointmentCompleted):
        return PushIntent(msg("Your car is ready", event.vehicle_label, type="appointment", id=event.appointment_id),
                          appointment_id=event.appointment_id)
    if isinstance(event, AppointmentCancelled):
        return PushIntent(msg("Appointment cancelled", event.reason, type="appointment", id=event.appointment_id),
                          appointment_id=event.appointment_id)
    if isinstance(event, EstimateSent):
        return PushIntent(msg("New estimate to review", event.code, type="estimate", id=event.invoice_id),
                          customer_id=event.customer_id)
    if isinstance(event, InvoiceIssued):
        return PushIntent(msg("New invoice", event.code, type="invoice", id=event.invoice_id),
                          customer_id=event.customer_id)
    if isinstance(event, MessagePosted):
        # Only garage replies the customer can see; never their own or internal notes.
        if event.author_role == "customer" or event.is_internal or event.customer_id is None:
            return None
        return PushIntent(msg(event.author_name or "New message", event.preview,
                              type="conversation", id=event.conversation_id),
                          customer_id=event.customer_id)
    if isinstance(event, CaseStatusChanged) and event.customer_id is not None:
        return PushIntent(msg("Roadside update", event.status.replace("_", " ").capitalize(),
                              type="case", id=event.case_id),
                          customer_id=event.customer_id)
    return None


async def deliver(intent: PushIntent) -> None:
    sender = get_push_sender()
    if sender is None:
        return
    try:
        async with async_session_factory() as session:
            customer_id = intent.customer_id
            if customer_id is None and intent.appointment_id is not None:
                customer_id = await session.scalar(select(Appointment.customer_id)
                                                   .where(Appointment.id == intent.appointment_id))
            if customer_id is None:
                return
            tokens = list(await session.scalars(select(PushDevice.token)
                                                .where(PushDevice.customer_id == customer_id)))
            if not tokens:
                return
            gone = await sender.send(tokens, intent.message)
            if gone:
                await session.execute(delete(PushDevice).where(PushDevice.token.in_(gone)))
                await session.commit()
    except Exception as exc:  # noqa: BLE001 — a push must never break business flow
        logger.error("Push delivery failed (%s)", type(exc).__name__)


_tasks: set[asyncio.Task] = set()


def on_event(event) -> None:
    """Event-bus handler (runs after commit): schedule delivery, never block."""
    if settings.PUSH_PROVIDER == "disabled":
        return
    intent = customer_push_for(event)
    if intent is None:
        return
    try:
        task = asyncio.get_running_loop().create_task(deliver(intent))
    except RuntimeError:
        return  # no loop (CLI commands): nothing to deliver to
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def drain() -> None:
    """Wait for scheduled deliveries (shutdown and tests)."""
    while _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


_PUSH_EVENTS = (AppointmentConfirmed, AppointmentCompleted, AppointmentCancelled,
                EstimateSent, InvoiceIssued, MessagePosted, CaseStatusChanged)


def register_push_handlers() -> None:
    """Idempotent: safe from app startup and from tests."""
    for event_type in _PUSH_EVENTS:
        if on_event not in event_bus._handlers.get(event_type, []):
            event_bus.register(event_type, on_event)
