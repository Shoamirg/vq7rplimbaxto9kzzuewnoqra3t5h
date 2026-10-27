from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class CustomerAccountCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=10, max_length=72, repr=False)
    @field_validator('password')
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password exceeds 72 UTF-8 bytes')
        return value


class CustomerAccountUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_active: bool




# ── mobile self-service ────────────────────────────────────────────────────
import uuid as _uuid
from typing import Optional

_PHONE = Field(pattern=r"^\+?[0-9\s\-()]{7,20}$")
_CODE = Field(pattern=r"^[0-9]{6}$")


def _password_field():
    return Field(min_length=10, max_length=72, repr=False)


class _NewPassword(BaseModel):
    @field_validator('password', 'new_password', check_fields=False)
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode('utf-8')) > 72:
            raise ValueError('Password exceeds 72 UTF-8 bytes')
        return value


class SignupStart(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)
    phone: str = _PHONE


class SignupComplete(_NewPassword):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)
    phone: str = _PHONE
    code: str = _CODE
    password: str = _password_field()
    service_center_id: Optional[_uuid.UUID] = None


class SignupVerify(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)
    phone: str = _PHONE
    code: str = _CODE


class _EmailOrPhone(BaseModel):
    """Identify an account by its email or by the phone on the customer record."""
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, pattern=r"^\+?[0-9\s\-()]{7,20}$")

    @model_validator(mode='after')
    def exactly_one(self):
        if (self.email is None) == (self.phone is None):
            raise ValueError('Provide either email or phone')
        return self

    @property
    def email_str(self) -> Optional[str]:
        return str(self.email) if self.email is not None else None


class CustomerPasswordLogin(_EmailOrPhone):
    model_config = ConfigDict(extra='forbid')
    password: str = Field(max_length=72, repr=False)


class PasswordResetStart(_EmailOrPhone):
    model_config = ConfigDict(extra='forbid')


class PasswordResetComplete(_EmailOrPhone, _NewPassword):
    model_config = ConfigDict(extra='forbid')
    code: str = _CODE
    new_password: str = _password_field()


class PasswordChange(_NewPassword):
    model_config = ConfigDict(extra='forbid')
    current_password: str = Field(max_length=72, repr=False)
    new_password: str = _password_field()


class AccountDelete(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: Optional[str] = Field(default=None, max_length=72, repr=False)


class CodeSent(BaseModel):
    detail: str = "If the details match, a code has been sent by SMS."
    expires_in: int
