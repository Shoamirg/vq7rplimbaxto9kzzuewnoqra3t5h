from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize(
    "secret_key",
    [
        "change-this-to-a-random-secret-key",
        "CHANGE-THIS-TO-A-RANDOM-SECRET-KEY",
        "CHANGE-THIS-TO-A-RANDOM-SECRET-KEY-extra",
        " change-this-to-a-random-secret-key ",
        "__CHANGE_ME_openssl_rand_hex_32__",
        "too-short",
    ],
)
def test_production_settings_reject_placeholder_or_short_secret(secret_key):
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            DEBUG=False,
            SECRET_KEY=secret_key,
        )


def test_production_settings_reject_debug_mode():
    with pytest.raises(ValidationError, match="DEBUG"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            DEBUG=True,
            SECRET_KEY="a" * 64,
        )


def test_production_settings_accept_strong_secret_and_debug_disabled():
    secret = "9f8e7d6c5b4a39281716151413121110ffeeddccbbaa99887766554433221100"
    config = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        DEBUG=False,
        SECRET_KEY=secret,
    )

    assert config.SECRET_KEY == secret
