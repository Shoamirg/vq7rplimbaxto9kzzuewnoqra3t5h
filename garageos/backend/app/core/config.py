from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List, Optional

# The .env lives at the garageos/ root (next to docker-compose.yml), while host
# tooling (uvicorn, alembic, seeds) runs from garageos/backend/. Resolve it by
# absolute path so CWD doesn't matter. In Docker the file is absent and
# container env vars take precedence — both paths work.
# config.py -> core -> app -> backend -> garageos
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Garage Management Platform"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
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

    # Rate limiting (Redis-backed, fixed window). Degrades open if Redis is down.
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

    model_config = {"env_file": str(_ENV_FILE), "case_sensitive": True, "extra": "ignore"}

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS (comma-separated) into a list of origins."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
