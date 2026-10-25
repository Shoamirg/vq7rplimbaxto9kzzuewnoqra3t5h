"""Bot configuration — reads the shared garageos/.env (same file the backend uses).

Secrets live only in that gitignored .env. TELEGRAM_MINI_APP_URL is the public
HTTPS URL where the /mini route group is served (a tunnel in dev, the real
domain in prod); the bot's menu button and /start button launch it.
"""
from __future__ import annotations

import os
from pathlib import Path

# telegram-bot/ -> garageos/
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def _load_env() -> None:
    if not _ENV_FILE.exists():
        return
    for raw in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_env()

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
# Public HTTPS URL of the Mini App (/mini). Empty in local dev without a tunnel.
MINI_APP_URL = os.environ.get("TELEGRAM_MINI_APP_URL", "").rstrip("/")
BOT_NAME = os.environ.get("TELEGRAM_BOT_NAME", "GarageOS")

# Backend (GarageOS API) — where customer chat messages are forwarded so they
# land in staff's Inbox. INGEST_SECRET is the shared bot↔backend trust token.
BACKEND_API = os.environ.get("API_BASE_URL", "http://backend:8000/api/v1").rstrip("/")
INGEST_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


def require_token() -> str:
    if not BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN is not set in garageos/.env")
    return BOT_TOKEN
