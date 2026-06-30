from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional


class CustomerCreate(BaseModel):
    telegram_id: int | None = None
    telegram_username: str | None = None
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(None, pattern=r"^\+?[\d\s\-()]{7,20}$")
    email: str | None = None
    address: str | None = None


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
