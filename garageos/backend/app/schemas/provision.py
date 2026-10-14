"""Non-secret manifest for operator-controlled garage provisioning."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class _Identity(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value: str) -> str:
        return value.lower()


class GarageSetup(_Identity):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    address: str | None = None
    timezone: str = Field(default="Asia/Tashkent", min_length=1, max_length=50)


class StaffSetup(_Identity):
    full_name: str = Field(min_length=1, max_length=255)
    role: Literal["admin", "manager", "receptionist", "mechanic"]
    password_env: str = Field(pattern=r"^GARAGEOS_STAFF_[A-Z0-9_]+$")


class ProvisionManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_center: GarageSetup
    staff: list[StaffSetup] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_staff_set(self) -> "ProvisionManifest":
        if not any(staff.role == "admin" for staff in self.staff):
            raise ValueError("At least one admin is required")
        emails = [staff.email for staff in self.staff]
        if len(emails) != len(set(emails)):
            raise ValueError("Staff emails must be unique")
        return self
