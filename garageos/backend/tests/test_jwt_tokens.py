from __future__ import annotations

import base64
from datetime import timedelta

from app.core.config import settings
from app.core.security import create_access_token, decode_token

_LEGACY_JOSE_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJsZWdhY3ktc3RhZmYiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjo0MTAyNDQ0ODAwfQ."
    "f3TEZD4imwP96uND5CrmsQhooaaB8EIL-AEaIWY5lO0"
)
_LEGACY_JOSE_REFRESH_TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJsZWdhY3ktc3RhZmYiLCJ0eXBlIjoicmVmcmVzaCIsImV4cCI6NDEwMjQ0NDgwMH0."
    "eSiZaOB0P3J9PSTi8DvYKL-UVSTkzgMpNb5gblvTGhM"
)


def test_token_created_by_previous_jose_library_remains_valid(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "compatibility-test-secret-32bytes")

    payload = decode_token(_LEGACY_JOSE_TOKEN)

    assert payload == {
        "sub": "legacy-staff",
        "type": "access",
        "exp": 4102444800,
    }


def test_refresh_token_created_by_previous_jose_library_remains_valid(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "compatibility-test-secret-32bytes")

    payload = decode_token(_LEGACY_JOSE_REFRESH_TOKEN)

    assert payload == {
        "sub": "legacy-staff",
        "type": "refresh",
        "exp": 4102444800,
    }


def test_access_token_round_trip_preserves_claims_and_expiration():
    token = create_access_token(
        {"sub": "staff-123", "type": "access"},
        expires_delta=timedelta(minutes=1),
    )

    payload = decode_token(token)

    assert payload is not None
    assert payload["sub"] == "staff-123"
    assert payload["type"] == "access"
    assert isinstance(payload["exp"], int)


def test_expired_access_token_is_rejected():
    token = create_access_token(
        {"sub": "staff-123", "type": "access"},
        expires_delta=timedelta(seconds=-1),
    )

    assert decode_token(token) is None


def test_access_token_with_tampered_signature_is_rejected():
    token = create_access_token({"sub": "staff-123", "type": "access"})
    header, payload, _signature = token.split(".")
    invalid_signature = base64.urlsafe_b64encode(bytes(32)).decode().rstrip("=")

    assert decode_token(f"{header}.{payload}.{invalid_signature}") is None
