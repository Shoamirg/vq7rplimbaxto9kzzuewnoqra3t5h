"""Hosted PostgreSQL URLs work with the app and Alembic's async driver."""
from pathlib import Path
import runpy
from unittest.mock import MagicMock

from alembic import context
from alembic.config import Config
import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings, settings


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+asyncpg"])
def test_hosted_database_url_selects_asyncpg_and_preserves_credentials(scheme):
    raw = f"{scheme}://qa_user:private%25password%40value@[::1]:5432/garage_qa?ssl=require"
    config = Settings(_env_file=None, DATABASE_URL=raw)
    engine = create_async_engine(config.DATABASE_URL)
    assert engine.dialect.is_async
    assert engine.dialect.driver == "asyncpg"
    parsed = make_url(config.DATABASE_URL)
    assert parsed.password == "private%password@value"
    assert parsed.host == "::1" and parsed.database == "garage_qa"
    assert parsed.query == {"ssl": "require"}


def test_database_driver_conversion_does_not_rewrite_other_schemes():
    url = "sqlite+aiosqlite:///private-postgresql://name.db"
    assert Settings(_env_file=None, DATABASE_URL=url).DATABASE_URL == url


def test_alembic_accepts_encoded_password_without_interpolation_or_secret_logs(monkeypatch, capsys):
    url = "postgresql+asyncpg://qa_user:private%25password%40value@db.railway.internal/garage_qa"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config()
    configure = MagicMock()
    monkeypatch.setattr(context, "config", config, raising=False)
    monkeypatch.setattr(context, "is_offline_mode", lambda: True)
    monkeypatch.setattr(context, "configure", configure)
    monkeypatch.setattr(context, "begin_transaction", MagicMock())
    monkeypatch.setattr(context, "run_migrations", lambda: None)
    runpy.run_path(str(Path(__file__).resolve().parents[1] / "alembic/env.py"))
    assert config.get_main_option("sqlalchemy.url") == url
    assert configure.call_args.kwargs["url"] == url
    captured = capsys.readouterr()
    assert url not in captured.out + captured.err
