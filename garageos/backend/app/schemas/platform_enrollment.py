"""Non-secret manifest for a separate trusted platform-identity operation."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class PlatformEnrollmentManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    service_center_id: UUID
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password_env: str = Field(pattern=r"^GARAGEOS_PLATFORM_[A-Z0-9_]+$")

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value: str) -> str:
        return value.lower()
