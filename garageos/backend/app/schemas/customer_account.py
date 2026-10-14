from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class CustomerPasswordLogin(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=255)
    password: str = Field(max_length=72, repr=False)
