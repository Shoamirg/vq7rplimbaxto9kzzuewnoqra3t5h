import ipaddress
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import List, Literal, Optional
from urllib.parse import urlsplit

# Resolve a local .env from either the backend directory or its parent. The
# backend is both embedded in the monorepo and exported as a standalone repo.
# In Docker neither file is required; explicit container environment wins.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_CANDIDATES = (_BACKEND_ROOT / ".env", _BACKEND_ROOT.parent / ".env")
_ENV_FILE = next((path for path in _ENV_CANDIDATES if path.is_file()), _ENV_CANDIDATES[0])


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Garage Management Platform"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "test", "staging", "production"] = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # CORS — comma-separated allowed origins. Kept as a raw string to avoid
    # pydantic-settings' JSON decoding of complex types from .env; use the
    # cors_origins_list property to get the parsed list.
    CORS_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://garage_user:garage_pass@localhost:5432/garage_platform"
    DATABASE_ECHO: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    SECRET_KEY: str = "change-this-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_WEBHOOK_URL: Optional[str] = None
    DEV_AUTH_ENABLED: bool = False
    TELEGRAM_PHONE_LINKING_ENABLED: bool = False

    # Rate limiting (Redis-backed, fixed window). Production fails closed if Redis is down.
    RATE_LIMIT_ENABLED: bool = True
    # Auth endpoints (login/refresh/telegram) — tight, brute-force sensitive.
    RATE_LIMIT_AUTH_MAX: int = 10
    RATE_LIMIT_AUTH_WINDOW_SECONDS: int = 60
    # Write-heavy endpoints — generous, abuse-oriented.
    RATE_LIMIT_WRITE_MAX: int = 60
    RATE_LIMIT_WRITE_WINDOW_SECONDS: int = 60
    # Trust proxy IP headers (X-Real-IP / rightmost X-Forwarded-For). Safe default
    # is OFF (use the socket peer); a directly-exposed app must not honor
    # client-supplied forwarding headers. Turn ON only when behind a proxy that
    # sets them (production sets this true in .env.prod behind Caddy).
    TRUST_PROXY_HEADERS: bool = False

    # Observability — Sentry is fully optional; error capture activates only when a
    # DSN is present, so dev and CI stay noise-free with zero config.
    SENTRY_DSN: Optional[str] = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0
    SENTRY_ENVIRONMENT: Optional[str] = None  # falls back to ENVIRONMENT

    # Public demo — a no-signup, READ-ONLY session into the demo tenant. Off by
    # default (dev/prod); the public marketing deployment turns it on. Demo tokens
    # carry a `demo` claim; a middleware rejects all writes, so the demo data stays
    # pristine with no reset needed.
    DEMO_MODE_ENABLED: bool = False
    DEMO_EMAIL: str = "admin@demo.garageos.app"

    # Admin
    ADMIN_EMAIL: str = "admin@garageplatform.com"
    ADMIN_PASSWORD: str = "admin123"

    # API
    API_V1_PREFIX: str = "/api/v1"

    model_config = {"env_file": str(_ENV_FILE), "case_sensitive": True, "extra": "ignore",
                    "hide_input_in_errors": True}

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def use_async_postgresql_driver(cls, value):
        # Hosting providers expose standard PostgreSQL URLs. Keep encoded
        # credentials/query options intact while selecting our installed driver.
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+asyncpg://" + value[len(prefix):]
        return value

    @model_validator(mode="after")
    def validate_deployment(self):
        if self.ENVIRONMENT not in {"staging", "production"}:
            return self
        if self.DEBUG:
            raise ValueError("DEBUG must be false in staging and production")
        secret = self.SECRET_KEY.strip()
        if (len(secret.encode("utf-8")) < 32 or len(set(secret)) < 2
                or secret.lower().startswith(("change", "__change", "replace", "__replace"))):
            raise ValueError("SECRET_KEY must be a generated secret of at least 32 bytes, without a placeholder")
        if self.DEV_AUTH_ENABLED or self.TELEGRAM_PHONE_LINKING_ENABLED:
            raise ValueError("Development authentication and phone-based Telegram linking must be disabled in deployments")
        if self.DEMO_MODE_ENABLED:
            raise ValueError("DEMO_MODE_ENABLED must be false in staging and production")
        if not self.RATE_LIMIT_ENABLED:
            raise ValueError("RATE_LIMIT_ENABLED must be true in staging and production")
        self._validate_dependency_url("DATABASE_URL", self.DATABASE_URL,
                                      {"postgres", "postgresql", "postgresql+asyncpg"})
        self._validate_dependency_url("REDIS_URL", self.REDIS_URL, {"redis", "rediss"})
        origins = self.cors_origins_list
        valid_origins = bool(origins)
        for origin in origins:
            try:
                parsed = urlsplit(origin)
                valid_origins = valid_origins and (
                    parsed.scheme == "https" and bool(parsed.hostname) and "*" not in origin
                    and parsed.username is None and parsed.password is None
                    and not parsed.path and not parsed.query and not parsed.fragment
                    and (parsed.port is None or 1 <= parsed.port <= 65535)
                )
            except ValueError:
                valid_origins = False
        if not valid_origins:
            raise ValueError("CORS_ORIGINS must contain explicit HTTPS origins without paths, credentials or wildcards")
        return self

    @staticmethod
    def _validate_dependency_url(name: str, value: str, schemes: set[str]) -> None:
        try:
            parsed = urlsplit(value.strip())
            hostname = parsed.hostname
            host = hostname.rstrip(".").lower() if hostname else ""
            try:
                address = ipaddress.ip_address(host)
                local = address.is_loopback or address.is_unspecified
            except ValueError:
                local = host == "localhost" or host.endswith(".localhost")
        except ValueError:
            hostname, local, parsed = None, False, None
        if parsed is None or parsed.scheme.lower() not in schemes or not hostname or local:
            raise ValueError(f"{name} must be an explicit non-local service URL in staging and production")

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS (comma-separated) into a list of origins."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
