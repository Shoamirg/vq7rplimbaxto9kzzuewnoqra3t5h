import re

from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime
from typing import Optional


class CustomerCreate(BaseModel):
    telegram_id: int | None = None
    telegram_username: str | None = None
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(None, pattern=r"^\+?[\d\s\-()]{7,20}$")
    email: str | None = None
    address: str | None = None


class StaffCustomerCreate(BaseModel):
    """Staff intake never accepts a tenant or external identity from the caller."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(pattern=r"^\+?[0-9\s\-()]{7,20}$")
    email: str | None = Field(None, max_length=255)
    address: str | None = Field(None, max_length=1000)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        digits = re.sub(r"\D", "", value)
        if not 7 <= len(digits) <= 15:
            raise ValueError("Phone must contain 7 to 15 digits")
        return ("+" if value.startswith("+") else "") + digits

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if not value:
            return None
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value.lower()


class CustomerUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, pattern=r"^\+?[\d\s\-()]{7,20}$")
    email: str | None = None
    address: str | None = None
    telegram_username: str | None = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    telegram_id: int | None
    telegram_username: str | None
    full_name: str
    phone: str | None
    email: str | None
    address: str | None
    loyalty_points: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    vehicle_count: int = 0


class CustomerListResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
