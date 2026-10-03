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
                                  env=env, capture_output=True, text=True, encoding="utf-8")

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
    for args in (("upgrade", "head"), ("downgrade", "-1"), ("upgrade", "head")):
        result = migrate(*args)
        assert result.returncode == 0, result.stderr
    assert await connection.fetchval(f"SELECT count(*) FROM {table} WHERE id = ANY($1::uuid[])", identifiers) == 2
