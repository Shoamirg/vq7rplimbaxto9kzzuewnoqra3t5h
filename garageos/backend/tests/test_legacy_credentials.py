"""Public, frozen vectors emitted by the former production credential libraries.

These are synthetic credentials, generated once from image 7fd3cba836e3 using
python-jose 3.3.0 and passlib/bcrypt. Do not regenerate with the current issuer:
the purpose is to detect loss of compatibility with already-issued credentials.
HTTP/database tests separately exercise principal, tenant and revocation checks.
"""
import json
from pathlib import Path

import pytest

from app.core.config import settings
from app.core.security import decode_token, verify_password
from tests.support.legacy_jwt import legacy_hs256


VECTORS = json.loads((Path(__file__).parent / "fixtures/legacy_credentials.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def public_fixture_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", VECTORS["secret"])
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")


@pytest.mark.parametrize("vector", VECTORS["valid"], ids=[
    "staff-access", "staff-refresh", "demo-access", "customer-access", "customer-refresh",
])
def test_valid_old_issuer_token_preserves_claims(vector):
    assert legacy_hs256(vector["claims"], VECTORS["secret"]) == vector["token"]
    assert decode_token(vector["token"]) == vector["claims"]


@pytest.mark.parametrize("vector", VECTORS["invalid"], ids=lambda v: v["reason"])
def test_invalid_old_issuer_token_is_rejected(vector):
    assert decode_token(vector["token"]) is None


def test_tampered_old_signature_is_rejected():
    header, body, signature = VECTORS["valid"][0]["token"].split(".")
    signature = ("A" if signature[0] != "A" else "B") + signature[1:]
    assert decode_token(f"{header}.{body}.{signature}") is None


@pytest.mark.parametrize("token", ["", "not.a.jwt", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0."])
def test_malformed_or_unsigned_token_is_rejected(token):
    assert decode_token(token) is None


def test_existing_bcrypt_password_survives_library_migration():
    assert verify_password(VECTORS["password"], VECTORS["bcrypt_hash"])
    assert not verify_password(VECTORS["password"] + "wrong", VECTORS["bcrypt_hash"])
