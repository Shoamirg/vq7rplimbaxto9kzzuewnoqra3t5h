"""Deployment settings fail closed without exposing supplied credentials."""
from __future__ import annotations

import os
import subprocess
import sys

import pytest
from pydantic import ValidationError

from app.core.config import Settings

VALID = dict(ENVIRONMENT="production", DEBUG=False,
             SECRET_KEY="c31ab862ba6855e49cf7581a61fe0f736d70a8c835c7ae149a324ced932a82d4",
             DATABASE_URL="postgresql+asyncpg://garage:secret@postgres.railway.internal:5432/garage",
             REDIS_URL="redis://redis.railway.internal:6379/0",
             CORS_ORIGINS="https://garage.example.org")


def test_production_rejects_debug_mode():
    with pytest.raises(ValidationError, match="DEBUG must be false"):
        Settings(_env_file=None, **{**VALID, "DEBUG": True})


@pytest.mark.parametrize(("field", "value"), [
    ("DATABASE_URL", "postgresql+asyncpg://garage:secret@localhost:5432/garage"),
    ("DATABASE_URL", "postgresql+asyncpg://garage:secret@127.0.0.1:5432/garage"),
    ("REDIS_URL", "redis://localhost:6379/0"),
    ("REDIS_URL", "redis://127.0.0.1:6379/0"),
    ("DATABASE_URL", ""),
    ("REDIS_URL", ""),
])
def test_deployment_rejects_missing_or_loopback_dependencies(field, value):
    with pytest.raises(ValidationError, match=field):
        Settings(_env_file=None, **{**VALID, field: value})


def test_deployment_defaults_cannot_point_at_local_dependencies():
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None, ENVIRONMENT="production", DEBUG=False,
                 SECRET_KEY=VALID["SECRET_KEY"],
                 CORS_ORIGINS=VALID["CORS_ORIGINS"],
                 REDIS_URL=VALID["REDIS_URL"])
    with pytest.raises(ValidationError, match="REDIS_URL"):
        Settings(_env_file=None, ENVIRONMENT="production", DEBUG=False,
                 SECRET_KEY=VALID["SECRET_KEY"],
                 CORS_ORIGINS=VALID["CORS_ORIGINS"],
                 DATABASE_URL=VALID["DATABASE_URL"])


@pytest.mark.parametrize(("field", "enabled"), [
    ("DEV_AUTH_ENABLED", True),
    ("TELEGRAM_PHONE_LINKING_ENABLED", True),
])
def test_deployment_disables_insecure_customer_authentication(field, enabled):
    with pytest.raises(ValidationError, match="authentication|linking"):
        Settings(_env_file=None, **{**VALID, field: enabled})


@pytest.mark.parametrize("secret", [
    "short", "change-this-to-a-random-secret-key", "__CHANGE_ME_openssl_rand_hex_32__",
    "replace-me-please-with-a-long-secret-key", "x" * 64,
])
def test_production_rejects_default_placeholder_and_weak_secrets(secret):
    with pytest.raises(ValidationError, match="SECRET_KEY") as error:
        Settings(_env_file=None, **{**VALID, "SECRET_KEY": secret})
    assert secret not in str(error.value)


@pytest.mark.parametrize("origins", [
    "", "*", "https://*.example.org", "http://garage.example.org",
    "https://garage.example.org/path", "https://user:password@garage.example.org",
    "https://garage.example.org?token=hidden", "https://garage.example.org:invalid",
])
def test_production_requires_explicit_https_origins(origins):
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(_env_file=None, **{**VALID, "CORS_ORIGINS": origins})


def test_valid_production_and_staging_configs_start_without_demo():
    for environment in ("production", "staging"):
        config = Settings(_env_file=None, **{**VALID, "ENVIRONMENT": environment,
                                          "CORS_ORIGINS": "https://garage.example.org, https://office.example.org:8443",
                                          "DEMO_MODE_ENABLED": False})
        assert config.cors_origins_list == ["https://garage.example.org", "https://office.example.org:8443"]
        assert config.DEMO_MODE_ENABLED is False


def test_deployment_rejects_public_demo_mode():
    with pytest.raises(ValidationError, match="DEMO_MODE_ENABLED"):
        Settings(_env_file=None, **{**VALID, "DEMO_MODE_ENABLED": True})


def test_deployment_requires_rate_limiting():
    with pytest.raises(ValidationError, match="RATE_LIMIT_ENABLED"):
        Settings(_env_file=None, **{**VALID, "RATE_LIMIT_ENABLED": False})


def test_environment_typo_cannot_bypass_deployment_validation():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**VALID, "ENVIRONMENT": "prodution"})


@pytest.mark.parametrize("environment", ["development", "test"])
def test_local_configs_remain_usable(environment):
    config = Settings(_env_file=None, ENVIRONMENT=environment, DEBUG=True,
                      SECRET_KEY="local", CORS_ORIGINS="http://localhost:3000")
    assert config.DEBUG is True


def test_startup_error_does_not_print_supplied_credentials():
    secret = "sensitive-deployment-key-never-print-this-value"
    env = {**os.environ, "ENVIRONMENT": "production", "DEBUG": "true", "SECRET_KEY": secret,
           "CORS_ORIGINS": "https://garage.example.org"}
    result = subprocess.run([sys.executable, "-c", "import app.core.config"], env=env,
                            capture_output=True, text=True, encoding="utf-8")
    assert result.returncode != 0
    assert "DEBUG must be false" in result.stderr
    assert secret not in result.stdout + result.stderr
