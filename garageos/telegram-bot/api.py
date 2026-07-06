"""A thin, dependency-light Telegram Bot API client (httpx).

We deliberately avoid a bot framework: the surface we need (getMe, setMyCommands,
setChatMenuButton, getUpdates, sendMessage) is small, and keeping it to httpx
means the bot runs on the same venv as the backend with nothing extra.
"""
from __future__ import annotations

from typing import Any

import httpx

from config import API_BASE, BACKEND_API, INGEST_SECRET, require_token


class TelegramError(RuntimeError):
    pass


class BackendError(RuntimeError):
    pass


def backend_ingest(payload: dict) -> dict:
    """Forward a customer's chat message to the GarageOS inbox.

    Returns the backend's JSON (``{"linked": bool, ...}``). Raises
    :class:`BackendError` on transport/HTTP failure so the caller can tell the
    customer something went wrong instead of silently dropping the message.
    """
    try:
        resp = httpx.post(
            f"{BACKEND_API}/telegram/ingest",
            json=payload,
            headers={"X-Bot-Secret": INGEST_SECRET},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise BackendError(str(exc)) from exc


def call(method: str, **params: Any) -> Any:
    require_token()
    # Nested structures (reply_markup, menu_button) must be JSON-encoded.
    payload = {
        k: (v if isinstance(v, (str, int, float, bool)) else _json(v))
        for k, v in params.items()
        if v is not None
    }
    resp = httpx.post(f"{API_BASE}/{method}", data=payload, timeout=30)
    data = resp.json()
    if not data.get("ok"):
        raise TelegramError(f"{method} failed: {data.get('description')}")
    return data["result"]


def get_updates(offset: int | None, timeout: int = 25) -> list[dict]:
    require_token()
    resp = httpx.get(
        f"{API_BASE}/getUpdates",
        params={"offset": offset, "timeout": timeout},
        timeout=timeout + 10,
    )
    data = resp.json()
    if not data.get("ok"):
        raise TelegramError(f"getUpdates failed: {data.get('description')}")
    return data["result"]


def _json(v: Any) -> str:
    import json

    return json.dumps(v)
