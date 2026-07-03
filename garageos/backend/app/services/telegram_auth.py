"""Telegram Mini App ``initData`` verification.

When the Mini App loads inside Telegram, the client hands the web app a signed
``initData`` string (a URL-encoded query string). We verify its HMAC signature
against the bot token so we can trust the embedded Telegram user identity — the
bot token is used *only* to check the signature, never as an identity itself.

Algorithm (per Telegram WebApp docs):
    secret_key      = HMAC_SHA256(key="WebAppData", msg=bot_token)
    data_check_str  = "\n".join(sorted "key=value" for every field except `hash`)
    expected_hash   = hex(HMAC_SHA256(key=secret_key, msg=data_check_str))
    valid           = constant_time_eq(expected_hash, provided hash)

We also enforce ``auth_date`` freshness so a leaked initData string cannot be
replayed indefinitely.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qsl

from app.exceptions import UnauthorizedError

# initData older than this is rejected as a replay. Telegram refreshes it on
# every launch, so a generous window still closes the replay window meaningfully.
_MAX_AUTH_AGE_SECONDS = 24 * 60 * 60


class InvalidInitData(UnauthorizedError):
    detail = "Invalid Telegram sign-in data"
    code = "INVALID_TELEGRAM_INIT_DATA"

    def __init__(self, detail: str | None = None):
        if detail:
            self.detail = detail


@dataclass(frozen=True)
class TelegramUser:
    """The trusted Telegram identity extracted from a verified initData."""

    telegram_id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    language_code: Optional[str]

    @property
    def full_name(self) -> str:
        parts = [p for p in (self.first_name, self.last_name) if p]
        return " ".join(parts) or (self.username or f"tg:{self.telegram_id}")


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def verify_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: int = _MAX_AUTH_AGE_SECONDS,
    now: float | None = None,
) -> TelegramUser:
    """Verify a Telegram Mini App ``initData`` string and return the user.

    Raises :class:`InvalidInitData` on a bad signature, a missing/expired
    ``auth_date``, or a malformed ``user`` payload.
    """
    if not init_data:
        raise InvalidInitData("Missing sign-in data")
    if not bot_token:
        # Misconfiguration, not a client error — but surface as unauthorized so
        # we never fall through to an unauthenticated request.
        raise InvalidInitData("Telegram bot token is not configured")

    # keep_blank_values so an empty field still participates in the check string.
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    provided_hash = pairs.pop("hash", None)
    if not provided_hash:
        raise InvalidInitData("Sign-in data is missing its signature")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    expected_hash = hmac.new(
        _secret_key(bot_token), data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, provided_hash):
        raise InvalidInitData("Sign-in signature does not match")

    auth_date = pairs.get("auth_date")
    if not auth_date or not auth_date.isdigit():
        raise InvalidInitData("Sign-in data is missing its timestamp")
    age = (now if now is not None else time.time()) - int(auth_date)
    if age > max_age_seconds:
        raise InvalidInitData("Sign-in data has expired; please reopen the app")

    return _parse_user(pairs.get("user"))


def _parse_user(user_json: str | None) -> TelegramUser:
    if not user_json:
        raise InvalidInitData("Sign-in data does not contain a user")
    try:
        data = json.loads(user_json)
        telegram_id = int(data["id"])
    except (ValueError, KeyError, TypeError):
        raise InvalidInitData("Sign-in user payload is malformed")

    return TelegramUser(
        telegram_id=telegram_id,
        username=data.get("username"),
        first_name=data.get("first_name"),
        last_name=data.get("last_name"),
        language_code=data.get("language_code"),
    )
