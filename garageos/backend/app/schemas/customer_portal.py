"""Customer-facing DTOs for the Mini App API.

These are intentionally *narrow*: the customer sees their own profile and the
garage's public identity, never staff notes, internal ids of other principals,
loyalty accounting internals, or any admin projection. Every field here is safe
to hand to an untrusted client.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import Field

from pydantic import BaseModel


class CustomerSummary(BaseModel):
    id: str
    full_name: str
    service_center_id: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    customer: CustomerSummary


class TelegramSignInRequest(BaseModel):
    """The raw ``initData`` string Telegram hands the Mini App on launch."""

    init_data: str


class LinkRequest(BaseModel):
    init_data: str
    phone: str


class RefreshRequest(BaseModel):
    refresh_token: str


class DevSignInRequest(BaseModel):
    """DEBUG-only sign-in — optionally target a specific seeded customer."""

    telegram_id: Optional[int] = None


class GarageIdentity(BaseModel):
    id: str
    name: str
    tagline: Optional[str] = None
    phone: Optional[str] = None


class MeResponse(BaseModel):
    id: str
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    loyalty_points: int = 0
    member_since: Optional[datetime] = None
    vehicle_count: int = 0
    garage: GarageIdentity


# ── Activity (shared by Home + Messages) ────────────────────────────────────
class ActivityItem(BaseModel):
    title: str
    detail: Optional[str] = None
    category: Optional[str] = None
    severity: str = "info"
    date: Optional[datetime] = None


# ── Home ────────────────────────────────────────────────────────────────────
class HomeAppointment(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    service_type: Optional[str] = None
    status: str
    vehicle_label: Optional[str] = None


class HomeInvoice(BaseModel):
    currency: str = "USD"
    id: str
    code: str
    balance: float


class HomeMessage(BaseModel):
    id: str
    subject: Optional[str] = None
    preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    awaiting_you: bool = False


class HomeVehicle(BaseModel):
    id: str
    label: str
    health_score: float
    band: str
    passport_tier: Optional[str] = None


class HomeResponse(BaseModel):
    balance_currency: str = "USD"
    balances_by_currency: dict[str, float] = Field(default_factory=dict)
    greeting: str
    garage: GarageIdentity
    sos_available: bool = True
    outstanding_balance: float = 0.0
    outstanding_invoice: Optional[HomeInvoice] = None
    next_appointment: Optional[HomeAppointment] = None
    latest_message: Optional[HomeMessage] = None
    primary_vehicle: Optional[HomeVehicle] = None
    activity: List[ActivityItem] = []


# ── Vehicles ────────────────────────────────────────────────────────────────
class VehicleCard(BaseModel):
    id: str
    label: str
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    plate: Optional[str] = None
    mileage: Optional[int] = None
    health_score: float
    band: str


class VehiclesResponse(BaseModel):
    vehicles: List[VehicleCard] = []


# ── Booking ─────────────────────────────────────────────────────────────────
class BookingRequest(BaseModel):
    vehicle_id: uuid.UUID
    service: str = Field(min_length=1, max_length=120)
    date: date
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int = Field(default=60, ge=15, le=480)


class BookingResult(BaseModel):
    id: str
    vehicle_label: str
    service: str
    date: datetime
    time: str
    duration_minutes: int
    mechanic_name: Optional[str] = None
    status: str


# ── Billing ─────────────────────────────────────────────────────────────────
class BillingDoc(BaseModel):
    currency: str = "USD"
    id: str
    code: str
    kind: str
    status: str
    total: float
    balance: float
    due_date: Optional[str] = None
    created_at: Optional[str] = None


class BillingReceipt(BaseModel):
    currency: str = "USD"
    id: str
    amount: float
    method: Optional[str] = None
    date: Optional[str] = None


class BillingResponse(BaseModel):
    balance_currency: str = "USD"
    balances_by_currency: dict[str, float] = Field(default_factory=dict)
    has_balance: bool = False
    balance_due: float = 0.0
    primary_invoice: Optional[BillingDoc] = None
    invoices: List[BillingDoc] = []
    estimates: List[BillingDoc] = []
    receipts: List[BillingReceipt] = []


class AskQuestionRequest(BaseModel):
    body: str


class AskResponse(BaseModel):
    conversation_id: str


# ── Messages ────────────────────────────────────────────────────────────────
class ConversationCard(BaseModel):
    id: str
    subject: Optional[str] = None
    status: str
    preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    awaiting_you: bool = False


class MessagesResponse(BaseModel):
    conversations: List[ConversationCard] = []
    activity: List[ActivityItem] = []


class ThreadAttachment(BaseModel):
    id: str
    kind: str
    label: str
    url: Optional[str] = None


class ThreadMessage(BaseModel):
    id: str
    from_me: bool
    author_name: Optional[str] = None
    body: Optional[str] = None
    created_at: Optional[datetime] = None
    attachments: List[ThreadAttachment] = []


class ThreadResponse(BaseModel):
    id: str
    subject: Optional[str] = None
    status: str
    messages: List[ThreadMessage] = []


class PostMessageRequest(BaseModel):
    body: str


# ── Roadside ────────────────────────────────────────────────────────────────
class RoadsideRequest(BaseModel):
    description: str
    vehicle_id: Optional[str] = None
    location_text: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class RoadsideAttachmentRequest(BaseModel):
    """Add a location/photo/voice attachment to an open roadside case's thread."""

    kind: str  # location | photo | voice
    label: str
    url: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    note: Optional[str] = None


class RoadsideStatusStep(BaseModel):
    key: str
    label: str
    done: bool
    current: bool = False


class RoadsideCase(BaseModel):
    id: str
    code: str
    status: str
    title: str
    severity: str
    created_at: Optional[datetime] = None
    vehicle_id: Optional[str] = None
    conversation_id: Optional[str] = None
    steps: List[RoadsideStatusStep] = []
