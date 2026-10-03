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
             CORS_ORIGINS="https://garage.example.org")


def test_production_rejects_debug_mode():
    with pytest.raises(ValidationError, match="DEBUG must be false"):
        Settings(_env_file=None, **{**VALID, "DEBUG": True})


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
