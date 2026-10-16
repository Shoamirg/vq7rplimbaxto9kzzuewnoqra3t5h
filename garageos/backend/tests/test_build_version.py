import pytest

from app.api.system import version


@pytest.mark.asyncio
async def test_version_reports_only_a_valid_commit_sha(monkeypatch):
    monkeypatch.setenv("BUILD_SHA", "A" * 40)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "b" * 40)
    response = await version()
    assert response["build_sha"] == "a" * 40


@pytest.mark.asyncio
async def test_version_uses_railway_sha_when_build_sha_is_invalid(monkeypatch):
    monkeypatch.setenv("BUILD_SHA", "private-build-label")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "c" * 40)
    response = await version()
    assert response["build_sha"] == "c" * 40


@pytest.mark.asyncio
async def test_version_does_not_echo_unvalidated_build_metadata(monkeypatch):
    monkeypatch.setenv("BUILD_SHA", "not-a-sha")
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA", raising=False)
    response = await version()
    assert response["build_sha"] == "unknown"
