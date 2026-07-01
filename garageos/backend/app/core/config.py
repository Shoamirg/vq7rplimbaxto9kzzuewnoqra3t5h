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
