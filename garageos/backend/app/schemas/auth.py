from pydantic import BaseModel, EmailStr, Field

from app.schemas.branding import Branding


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=8192)


class LogoutResponse(BaseModel):
    ok: bool = True


class RegisterAdminRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    service_center_name: str = Field(min_length=1, max_length=255)


class RegisterAdminResponse(BaseModel):
    id: str
    email: str
    full_name: str
    service_center_id: str
    message: str = "Admin registered successfully. Please login."


class CurrentUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str | None = None
    service_center_id: str
    is_super_admin: bool
    permissions: list[str] = Field(default_factory=list)
    platform_permissions: list[str] = Field(default_factory=list)
    branding: Branding | None = None
