"""Request/response shapes for the platform control center (super-admin only)."""
import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

PlatformRole = Literal['admin', 'manager', 'receptionist', 'mechanic']
_SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def _required(value: str) -> str:
    if not value.strip():
        raise ValueError('Value is required')
    return value.strip()


class NetworkCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=160)
    slug: str = Field(min_length=1, max_length=60)
    is_exclusive: bool = False

    strip_name = field_validator('name')(_required)

    @field_validator('slug')
    @classmethod
    def slug_format(cls, value: str) -> str:
        value = value.strip().lower()
        if not _SLUG.match(value):
            raise ValueError('Slug may contain lowercase letters, digits and single dashes')
        return value


class NetworkUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=160)
    is_exclusive: bool | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def no_nulls(self):
        if not self.model_fields_set:
            raise ValueError('Provide at least one field to change')
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('Fields may not be null')
        if self.name is not None:
            self.name = _required(self.name)
        return self


class WorkshopAdmin(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=12, max_length=72, repr=False)

    strip_name = field_validator('full_name')(_required)

    @field_validator('password')
    @classmethod
    def password_bytes(cls, value: str) -> str:
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be at most 72 UTF-8 bytes')
        return value


class WorkshopCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    timezone: str = Field(default='Asia/Tashkent', min_length=1, max_length=50)
    network_id: uuid.UUID | None = None
    admin: WorkshopAdmin

    strip_name = field_validator('name')(_required)


class WorkshopUpdate(BaseModel):
    """``network_id: null`` explicitly moves a workshop out to independent."""
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=255)
    network_id: uuid.UUID | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def no_nulls(self):
        if not self.model_fields_set:
            raise ValueError('Provide at least one field to change')
        if any(getattr(self, field) is None for field in self.model_fields_set - {'network_id'}):
            raise ValueError('Fields may not be null')
        if self.name is not None:
            self.name = _required(self.name)
        return self


class StaffAccessUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: PlatformRole | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def has_changes(self):
        if not self.model_fields_set or any(getattr(self, f) is None for f in self.model_fields_set):
            raise ValueError('Provide role and/or is_active')
        return self


class WorkshopNode(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    address: str | None
    timezone: str
    network_id: uuid.UUID | None
    is_active: bool
    staff_count: int
    customer_count: int


class NetworkNode(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_exclusive: bool
    is_active: bool
    workshops: list[WorkshopNode]


class PlatformTree(BaseModel):
    networks: list[NetworkNode]
    independent: list[WorkshopNode]


class StaffMember(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    is_active: bool
    is_super_admin: bool


class AuditEntry(BaseModel):
    id: uuid.UUID
    created_at: datetime
    action: str
    status: str
    service_center_id: uuid.UUID | None
    garage: str | None
    actor_email: str | None
    resource_type: str | None
    ip: str | None


class AuditPage(BaseModel):
    items: list[AuditEntry]
    total: int
    page: int
    page_size: int
