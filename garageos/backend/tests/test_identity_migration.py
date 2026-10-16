"""Alembic refuses existing duplicates without changing customer data."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import uuid

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy.engine import make_url

from app.core.config import settings

BACKEND = Path(__file__).resolve().parents[1]


@pytest_asyncio.fixture
async def migration_database():
    source = make_url(settings.DATABASE_URL)
    if (settings.ENVIRONMENT != "test" or source.host not in {"127.0.0.1", "localhost", "::1"}
            or source.database != "garage_test"):
        pytest.skip("Migration tests require ENVIRONMENT=test and a loopback garage_test database")
    name = f"garage_identity_migration_{uuid.uuid4().hex}"
    admin = await asyncpg.connect(source.set(drivername="postgresql").render_as_string(hide_password=False))
    connection = None
    created = False
    try:
        await admin.execute(f'CREATE DATABASE "{name}"')
        created = True
        child = source.set(database=name)

        def migrate(*args):
            env = {**os.environ, "DATABASE_URL": child.render_as_string(hide_password=False)}
            return subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND,
                                  env=env, capture_output=True, text=True, encoding="utf-8", timeout=120)

        result = migrate("upgrade", "a2b3c4d5e6f7")
        assert result.returncode == 0, result.stderr
        connection = await asyncpg.connect(child.set(drivername="postgresql").render_as_string(hide_password=False))
        yield connection, migrate
    finally:
        if connection is not None:
            await connection.close()
        if created:
            # Only the unique database created above is ever removed.
            await admin.execute(f'DROP DATABASE "{name}"')
        await admin.close()


@pytest.mark.parametrize("table,field,original,duplicate,index", [
    ("customers", "phone", "+998 (90) 123-4567", "998901234567", "uq_customers_center_phone_active"),
    ("vehicles", "license_plate", "01 A 123 BC", "01-a123bc", "uq_vehicles_center_plate_active"),
    ("vehicles", "vin", "JH4-KA8260MC", "jh4ka8260mc", "uq_vehicles_center_vin_active"),
])
async def test_upgrade_stops_on_existing_duplicates_without_deleting_or_merging(
        migration_database, table, field, original, duplicate, index):
    connection, migrate = migration_database
    center, owner, brand, model = (uuid.uuid4() for _ in range(4))
    await connection.execute("INSERT INTO service_centers (id, name, timezone, is_active) VALUES ($1, 'Migration garage', 'UTC', true)", center)
    await connection.execute("INSERT INTO customers (id, service_center_id, full_name, loyalty_points, is_active) VALUES ($1, $2, 'Owner', 0, true)", owner, center)
    await connection.execute("INSERT INTO brands (id, name, is_active) VALUES ($1, 'Migration brand', true)", brand)
    await connection.execute("INSERT INTO vehicle_models (id, brand_id, name, is_active) VALUES ($1, $2, 'Migration model', true)", model, brand)
    identifiers = [uuid.uuid4(), uuid.uuid4()]
    for id_, value in zip(identifiers, (original, duplicate)):
        if table == "customers":
            await connection.execute("INSERT INTO customers (id, service_center_id, full_name, phone, loyalty_points, is_active) VALUES ($1, $2, 'Existing owner', $3, 0, true)", id_, center, value)
        else:
            await connection.execute(f"INSERT INTO vehicles (id, service_center_id, customer_id, vehicle_model_id, year, {field}, current_km, is_active) VALUES ($1, $2, $3, $4, 2020, $5, 0, true)", id_, center, owner, model, value)

    failed = migrate("upgrade", "head")
    assert failed.returncode != 0
    assert f"Cannot create {index}: 1 duplicate active identity groups" in failed.stderr
    assert original not in failed.stderr and duplicate not in failed.stderr
    assert await connection.fetchval("SELECT version_num FROM alembic_version") == "a2b3c4d5e6f7"
    rows = await connection.fetch(f"SELECT id, {field}, is_active FROM {table} WHERE id = ANY($1::uuid[]) ORDER BY id", identifiers)
    assert len(rows) == 2 and all(row["is_active"] for row in rows)
    assert {row[field] for row in rows} == {original, duplicate}
    assert await connection.fetchval("SELECT to_regclass('uq_customers_center_phone_active')") is None

    # An operator resolves only this synthetic conflict; migration itself never
    # guesses which real record should be archived. Upgrade/rollback preserve it.
    await connection.execute(f"UPDATE {table} SET is_active = false WHERE id = $1", identifiers[1])
    for args in (("upgrade", "head"), ("downgrade", "a2b3c4d5e6f7"), ("upgrade", "head")):
        result = migrate(*args)
        assert result.returncode == 0, result.stderr
    assert await connection.fetchval(f"SELECT count(*) FROM {table} WHERE id = ANY($1::uuid[])", identifiers) == 2


async def test_fresh_migrations_match_all_models_without_demo_seed(migration_database):
    _, migrate = migration_database
    result = migrate("upgrade", "head")
    assert result.returncode == 0, result.stderr
    check = migrate("check")
    assert check.returncode == 0, check.stderr[:800]


async def test_upgrade_adopts_seed_created_inbox_and_rollback_keeps_messages(migration_database):
    connection, migrate = migration_database
    name = await connection.fetchval("SELECT current_database()")
    url = make_url(settings.DATABASE_URL).set(database=name).render_as_string(hide_password=False)
    env = {**os.environ, "DATABASE_URL": url}
    # Reproduce the older seed's schema-only creation, without seeding a garage.
    # That seed predates customer accounts, message intents and auth sessions;
    # let their migrations create these tables instead of today's metadata.
    seed_schema = (
        "import asyncio; import app.models; from app.core.database import Base, init_db; "
        "Base.metadata.remove(Base.metadata.tables['auth_sessions']); "
        "Base.metadata.remove(Base.metadata.tables['customer_accounts']); "
        "Base.metadata.remove(Base.metadata.tables['message_intents']); asyncio.run(init_db())"
    )
    created = subprocess.run([sys.executable, "-c", seed_schema],
                             cwd=BACKEND, env=env, capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert created.returncode == 0, created.stderr
    assert await connection.fetchval("SELECT to_regclass('auth_sessions')") is None
    # Reproduce the pre-observation seed's actual legacy columns. Today's
    # metadata has newer generations/authority which that seed never created.
    await connection.execute("DROP TABLE conversation_read_observations")
    for name in ['ck_conversation_message_generation', 'ck_conversation_activity_generation']:
        await connection.execute(f'ALTER TABLE conversations DROP CONSTRAINT "{name}"')
    for name in ['message_generation', 'activity_generation', 'acknowledged_message_generation', 'acknowledged_activity_generation']:
        await connection.execute(f'ALTER TABLE conversations DROP COLUMN "{name}"')
    center, conversation, message, participant, attachment = (uuid.uuid4() for _ in range(5))
    await connection.execute("INSERT INTO service_centers (id, name, timezone, is_active) VALUES ($1, 'Existing inbox garage', 'UTC', true)", center)
    await connection.execute("INSERT INTO conversations (id, service_center_id, subject, conv_type, status, priority, unread_messages, unread_activity, summary_version, is_active) VALUES ($1, $2, 'Existing thread', 'general', 'open', 'medium', 1, 0, 0, true)", conversation, center)
    await connection.execute("INSERT INTO conversation_messages (id, service_center_id, conversation_id, kind, channel, is_internal, author_role, body, delivery_status, is_active) VALUES ($1, $2, $3, 'text', 'web', false, 'customer', 'Keep this message', 'sent', true)", message, center, conversation)
    await connection.execute("INSERT INTO conversation_participants (id, service_center_id, conversation_id, role, display_name, is_following, is_online, is_typing, is_active) VALUES ($1, $2, $3, 'customer', 'Owner', false, false, false, true)", participant, center, conversation)
    await connection.execute("INSERT INTO conversation_attachments (id, service_center_id, conversation_id, message_id, kind, label, url, is_active) VALUES ($1, $2, $3, $4, 'photo', 'Existing photo', '/unchanged.jpg', true)", attachment, center, conversation, message)

    for args in (("upgrade", "head"), ("downgrade", "b3c4d5e6f7a8"), ("upgrade", "head")):
        result = migrate(*args)
        assert result.returncode == 0, result.stderr
        row = await connection.fetchrow("SELECT c.subject, m.body, p.display_name, a.url FROM conversations c JOIN conversation_messages m ON m.conversation_id = c.id JOIN conversation_participants p ON p.conversation_id = c.id JOIN conversation_attachments a ON a.message_id = m.id WHERE c.id = $1", conversation)
        assert tuple(row) == ("Existing thread", "Keep this message", "Owner", "/unchanged.jpg")
    check = migrate("check")
    assert check.returncode == 0, check.stderr[:800]
