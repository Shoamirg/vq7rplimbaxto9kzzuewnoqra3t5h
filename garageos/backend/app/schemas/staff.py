from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

EmployeeRole = Literal['mechanic', 'manager', 'receptionist']


class StaffCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=10, max_length=72, repr=False)
    role: EmployeeRole = 'mechanic'
    phone: str | None = Field(default=None, max_length=50)

    @field_validator('full_name')
    @classmethod
    def name(cls, value):
        if not value.strip():
            raise ValueError('Name is required')
        return value.strip()

    @field_validator('password')
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password must be at most 72 UTF-8 bytes')
        return value


class StaffUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    role: EmployeeRole | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def valid_fields(self):
        for field in self.model_fields_set - {'phone'}:
            if getattr(self, field) is None:
                raise ValueError(f'{field} must not be null')
        if self.full_name is not None:
            self.full_name = self.full_name.strip()
            if not self.full_name:
                raise ValueError('Name is required')
        return self
