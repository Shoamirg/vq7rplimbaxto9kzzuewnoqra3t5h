"""Customer-facing DTOs for the Mini App API.

These are intentionally *narrow*: the customer sees their own profile and the
garage's public identity, never staff notes, internal ids of other principals,
loyalty accounting internals, or any admin projection. Every field here is safe
to hand to an untrusted client.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

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
