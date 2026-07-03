"""Unit tests for Telegram Mini App initData verification.

Pure crypto/parsing — no DB. We sign initData exactly as Telegram does and
assert the verifier accepts genuine data and rejects tampering, replay, and
malformed payloads.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.services.telegram_auth import InvalidInitData, verify_init_data

BOT = "123456:test-bot-token"


def _sign(bot_token: str, fields: dict) -> str:
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields = {**fields, "hash": hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()}
    return urlencode(fields)


def _init_data(bot_token=BOT, telegram_id=555, auth_date=None, **user_extra) -> str:
    user = {"id": telegram_id, "username": "ahmed", "first_name": "Ahmed", **user_extra}
    return _sign(bot_token, {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAH123",
        "user": json.dumps(user),
    })


def test_valid_init_data_returns_user():
    tg = verify_init_data(_init_data(telegram_id=777), BOT)
    assert tg.telegram_id == 777
    assert tg.username == "ahmed"
    assert tg.full_name == "Ahmed"


def test_language_code_is_extracted():
    tg = verify_init_data(_init_data(language_code="ru"), BOT)
    assert tg.language_code == "ru"


def test_tampered_hash_is_rejected():
    data = _init_data() + "0"  # corrupt the trailing hash
    with pytest.raises(InvalidInitData):
        verify_init_data(data, BOT)


def test_wrong_bot_token_is_rejected():
    with pytest.raises(InvalidInitData):
        verify_init_data(_init_data(bot_token=BOT), "999:other-token")


def test_missing_hash_is_rejected():
    with pytest.raises(InvalidInitData):
        verify_init_data("auth_date=1&user=%7B%7D", BOT)


def test_expired_auth_date_is_rejected():
    old = int(time.time()) - 10_000
    with pytest.raises(InvalidInitData):
        verify_init_data(_init_data(auth_date=old), BOT, max_age_seconds=3600)


def test_empty_init_data_is_rejected():
    with pytest.raises(InvalidInitData):
        verify_init_data("", BOT)


def test_missing_bot_token_is_rejected():
    with pytest.raises(InvalidInitData):
        verify_init_data(_init_data(), "")
