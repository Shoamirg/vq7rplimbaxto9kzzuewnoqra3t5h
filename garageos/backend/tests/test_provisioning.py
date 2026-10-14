"""Operator provisioning command, observed through real authenticated HTTP."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

import asyncpg
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select, update
from sqlalchemy.engine import make_url

from app.core.database import async_session_factory, engine
from app.core.config import settings
from app.main import app
from app.models import Role, ServiceCenter, User
from app.core.security import hash_password

BACKEND = Path(__file__).resolve().parents[1]
PASSWORD = "Provision-test-only-2026!"


@pytest_asyncio.fixture
async def manifest(tmp_path):
    tag = uuid.uuid4().hex
    config = {
        "service_center": {"name": "Provisioned workshop", "email": f"garage-{tag}@example.com"},
        "staff": [
            {"email": f"{role}-{tag}@example.com", "full_name": f"Provision {role}",
             "role": role, "password_env": f"GARAGEOS_STAFF_{role.upper()}_PASSWORD"}
            for role in ("admin", "receptionist", "mechanic")
        ],
    }
    path = tmp_path / "garage.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    center_email = config["service_center"]["email"]
    try:
        yield config, path
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(ServiceCenter).where(func.lower(ServiceCenter.email).in_([center_email, f"other-{center_email}"])))
            await session.commit()
        await engine.dispose()


async def _command(path, *, apply=False, passwords=True, password_value=PASSWORD, database_url=None):
    env = dict(os.environ)
    if database_url:
        env["DATABASE_URL"] = database_url
    for role in ("ADMIN", "RECEPTIONIST", "MECHANIC", "MANAGER"):
        key = f"GARAGEOS_STAFF_{role}_PASSWORD"
        if passwords:
            env[key] = password_value
        else:
            env.pop(key, None)
    command = [sys.executable, "-m", "app.commands.provision", "--config", str(path)]
    if apply:
        command.append("--apply")
    process = await asyncio.create_subprocess_exec(
        *command, cwd=BACKEND, env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise
    return process.returncode, stdout.decode(), stderr.decode()


async def _login(client, email, password=PASSWORD):
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_operator_provisioned_staff_can_sign_in_to_an_empty_workspace(manifest):
    config, path = manifest
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    assert PASSWORD not in output + errors
    result = json.loads(output)
    assert result["applied"] is True
    assert result["service_center"]["state"] == "created"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for staff in config["staff"]:
            headers = await _login(client, staff["email"])
            profile = await client.get("/api/v1/auth/me", headers=headers)
            assert profile.status_code == 200
            assert profile.json()["service_center_id"] == result["service_center"]["id"]
            assert profile.json()["role"] == staff["role"]
            assert profile.json()["is_super_admin"] is False
            mechanic = staff["role"] == "mechanic"
            operator_permissions = {
                "admin": ["staff.read", "staff.write", "billing.read", "billing.create", "billing.write",
                          "billing.payment.record", "financial.refund", "financial.invoice.void", "financial.reports.read"],
                "manager": ["staff.read", "staff.write", "billing.read", "billing.create", "billing.write",
                            "billing.payment.record", "financial.refund", "financial.invoice.void", "financial.reports.read"],
                "receptionist": ["staff.read", "staff.write", "billing.read", "billing.create", "billing.write",
                                 "billing.payment.record"],
            }
            permissions = (["work.read.assigned", "work.write.assigned"] if mechanic
                           else operator_permissions[staff["role"]])
            assert profile.json()["permissions"] == permissions
            for route in ("customers", "vehicles", "appointments", "invoices"):
                listed = await client.get(f"/api/v1/{route}", headers=headers)
                assert listed.status_code == (403 if mechanic else 200), listed.text
                if not mechanic:
                    assert listed.json()["items"] == []
            if mechanic:
                own_work = await client.get("/api/v1/mechanic/work", headers=headers)
                assert own_work.status_code == 200
                assert own_work.json()["items"] == []
        operator = next(staff for staff in config["staff"] if staff["role"] == "admin")
        catalog = await client.get("/api/v1/vehicles/catalog", headers=await _login(client, operator["email"]))
        assert catalog.status_code == 200
        assert catalog.json()["brands"]


async def test_default_command_only_plans_without_passwords(manifest):
    config, path = manifest
    code, output, errors = await _command(path, passwords=False)
    assert code == 0, errors
    result = json.loads(output)
    assert result["applied"] is False
    assert result["service_center"]["id"] is None
    assert result["service_center"]["state"] == "create"
    assert [staff["state"] for staff in result["staff"]] == ["create"] * 3
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for staff in config["staff"]:
            response = await client.post("/api/v1/auth/login", json={"email": staff["email"], "password": PASSWORD})
            assert response.status_code == 401


async def test_repeat_setup_preserves_accounts_and_can_add_staff(manifest):
    config, path = manifest
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    first = json.loads(output)
    code, output, errors = await _command(path, apply=True, passwords=False)
    assert code == 0, errors
    repeated = json.loads(output)
    assert repeated["service_center"]["id"] == first["service_center"]["id"]
    assert [staff["id"] for staff in repeated["staff"]] == [staff["id"] for staff in first["staff"]]
    assert [staff["state"] for staff in repeated["staff"]] == ["kept"] * 3
    code, output, errors = await _command(path, passwords=False)
    assert code == 0, errors
    assert json.loads(output)["service_center"]["state"] == "keep"
    config["staff"].append({"email": f"manager-{uuid.uuid4().hex}@example.com", "full_name": "Provision manager",
                            "role": "manager", "password_env": "GARAGEOS_STAFF_MANAGER_PASSWORD"})
    path.write_text(json.dumps(config), encoding="utf-8")
    new_password = "New-staff-only-secret-2026!"
    code, output, errors = await _command(path, apply=True, password_value=new_password)
    assert code == 0, errors
    added = json.loads(output)
    assert added["staff"][-1]["state"] == "created"
    assert added["staff"][0]["id"] == first["staff"][0]["id"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await _login(client, config["staff"][0]["email"])
        await _login(client, config["staff"][-1]["email"], new_password)
        changed = await client.post("/api/v1/auth/login", json={"email": config["staff"][0]["email"], "password": new_password})
        assert changed.status_code == 401


@pytest.mark.parametrize("location,value", [
    (("service_center", "name"), "   "),
    (("service_center", "email"), "invalid-email"),
    (("service_center", "timezone"), "Not/A_Timezone"),
    (("staff", 0, "role"), "super_admin"),
    (("staff", 0, "is_super_admin"), True),
    (("staff", 0, "password"), PASSWORD),
    (("staff", 0, "full_name"), "   "),
    (("staff", 0, "password_env"), "DATABASE_URL"),
])
async def test_invalid_configuration_is_rejected_without_secret_output(manifest, location, value):
    config, path = manifest
    changed = json.loads(json.dumps(config))
    target = changed
    for key in location[:-1]:
        target = target[key]
    target[location[-1]] = value
    path.write_text(json.dumps(changed), encoding="utf-8")
    code, output, errors = await _command(path)
    assert code == 2
    assert "Provisioning failed:" in errors
    assert PASSWORD not in output + errors
    assert "Traceback" not in errors


@pytest.mark.parametrize("kind", ["missing_admin", "duplicate_email"])
async def test_staff_manifest_requires_an_admin_and_unique_emails(manifest, kind):
    config, path = manifest
    if kind == "missing_admin":
        config["staff"][0]["role"] = "mechanic"
    else:
        config["staff"][1]["email"] = config["staff"][0]["email"].upper()
    path.write_text(json.dumps(config), encoding="utf-8")
    code, output, errors = await _command(path)
    assert code == 2
    assert "Provisioning failed:" in errors


@pytest.mark.parametrize("password", [None, "demo1234", " " * 12, "x" * 73, "😀" * 20])
async def test_invalid_new_password_fails_atomically_and_does_not_leak(manifest, password):
    config, path = manifest
    code, output, errors = await _command(path, apply=True, passwords=password is not None, password_value=password)
    assert code == 2
    assert "Provisioning failed:" in errors
    assert "Traceback" not in errors
    if password is not None:
        assert password not in output + errors
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/auth/login", json={"email": config["staff"][0]["email"], "password": PASSWORD})
        assert response.status_code == 401
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    assert json.loads(output)["service_center"]["state"] == "created"


@pytest.mark.parametrize("apply", [False, True])
async def test_setup_cannot_transfer_another_garages_staff(manifest, apply):
    config, path = manifest
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    center_id = json.loads(output)["service_center"]["id"]
    other = json.loads(json.dumps(config))
    other["service_center"]["email"] = f"other-{uuid.uuid4().hex}@example.com"
    path.write_text(json.dumps(other), encoding="utf-8")
    code, output, errors = await _command(path, apply=apply)
    assert code == 2
    assert "another garage" in errors
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _login(client, config["staff"][0]["email"])
        profile = await client.get("/api/v1/auth/me", headers=headers)
        assert profile.json()["service_center_id"] == center_id


@pytest.mark.parametrize("change", ["garage_name", "staff_name", "staff_role", "suspended_garage", "suspended_staff"])
async def test_existing_identity_conflicts_fail_without_overwrite(manifest, change):
    config, path = manifest
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    initial = json.loads(output)
    changed = json.loads(json.dumps(config))
    if change == "garage_name":
        changed["service_center"]["name"] = "Unexpected replacement"
    elif change == "staff_name":
        changed["staff"][1]["full_name"] = "Unexpected replacement"
    elif change == "staff_role":
        changed["staff"][1]["role"] = "manager"
    else:
        model = ServiceCenter if change == "suspended_garage" else User
        identity = initial["service_center"]["id"] if model is ServiceCenter else initial["staff"][0]["id"]
        async with async_session_factory() as session:
            await session.execute(update(model).where(model.id == uuid.UUID(identity)).values(is_active=False))
            await session.commit()
    path.write_text(json.dumps(changed), encoding="utf-8")
    code, output, errors = await _command(path, apply=True)
    assert code == 2
    assert "Provisioning failed:" in errors
    assert "Traceback" not in errors
    if change.startswith("suspended"):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"email": config["staff"][0]["email"], "password": PASSWORD})
            assert login.status_code == 401
    else:
        path.write_text(json.dumps(config), encoding="utf-8")
        code, output, errors = await _command(path, apply=True, passwords=False)
        assert code == 0, errors
        assert [staff["id"] for staff in json.loads(output)["staff"]] == [staff["id"] for staff in initial["staff"]]
        assert [staff["role"] for staff in json.loads(output)["staff"]] == ["admin", "receptionist", "mechanic"]


async def test_concurrent_setup_returns_the_same_garage_and_staff(manifest):
    _, path = manifest
    calls = await asyncio.gather(_command(path, apply=True), _command(path, apply=True))
    for code, output, errors in calls:
        assert code == 0, errors
    results = [json.loads(output) for _, output, _ in calls]
    assert results[0]["service_center"]["id"] == results[1]["service_center"]["id"]
    assert [staff["id"] for staff in results[0]["staff"]] == [staff["id"] for staff in results[1]["staff"]]
    assert sorted(result["service_center"]["state"] for result in results) == ["created", "kept"]


async def test_provisioning_requires_current_migrations_before_any_setup(manifest):
    _, path = manifest
    source = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT != "test" or source.database != "garage_test" or source.host not in {"localhost", "127.0.0.1", "::1"}:
        pytest.skip("Disposable migration check requires a loopback garage_test database")
    database = f"garage_provision_{uuid.uuid4().hex}"
    admin = await asyncpg.connect(source.set(drivername="postgresql").render_as_string(hide_password=False))
    try:
        await admin.execute(f'CREATE DATABASE "{database}"')
        child_url = source.set(database=database).render_as_string(hide_password=False)
        migrated = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "a2b3c4d5e6f7"],
                                  cwd=BACKEND, env={**os.environ, "DATABASE_URL": child_url}, capture_output=True, text=True)
        assert migrated.returncode == 0, migrated.stderr
        code, output, errors = await _command(path, apply=True, database_url=child_url)
        assert code == 2
        assert "alembic upgrade head" in errors
        child = await asyncpg.connect(source.set(database=database, drivername="postgresql").render_as_string(hide_password=False))
        try:
            for table in ("service_centers", "users", "roles", "brands", "vehicle_models"):
                assert await child.fetchval(f"SELECT count(*) FROM {table}") == 0
        finally:
            await child.close()
    finally:
        await admin.execute(f'DROP DATABASE IF EXISTS "{database}"')
        await admin.close()


async def test_new_garage_can_run_service_work_and_isolate_a_second_garage(manifest):
    config, path = manifest
    code, output, errors = await _command(path, apply=True)
    assert code == 0, errors
    assert json.loads(output)["service_center"]["timezone"] == "Asia/Tashkent"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        reception = await _login(client, config["staff"][1]["email"])
        mechanic = await _login(client, config["staff"][2]["email"])
        calendar = await client.get("/api/v1/calendar", params={"start": "2030-05-01", "end": "2030-05-02"}, headers=reception)
        assert calendar.status_code == 200
        assert [worker["name"] for worker in calendar.json()["mechanics"]] == ["Provision mechanic"]
        catalog = await client.get("/api/v1/vehicles/catalog", headers=reception)
        model = next(model for brand in catalog.json()["brands"] if brand["name"] == "Chevrolet" for model in brand["models"] if model["name"] == "Cobalt")
        customer = await client.post("/api/v1/customers", headers=reception, json={"full_name": "First customer", "phone": "+998901234501"})
        assert customer.status_code == 201, customer.text
        customer_id = customer.json()["id"]
        vehicle = await client.post("/api/v1/vehicles", headers=reception, json={"customer_id": customer_id, "vehicle_model_id": model["id"], "year": 2024, "license_plate": "01 A 501 BC"})
        assert vehicle.status_code == 201, vehicle.text
        vehicle_id = vehicle.json()["id"]
        appointment = await client.post("/api/v1/appointments/direct", headers=reception, json={"customer_id": customer_id, "vehicle_id": vehicle_id, "appointment_date": "2030-05-01", "appointment_time": "10:00"})
        assert appointment.status_code == 201, appointment.text
        appointment_id = appointment.json()["id"]
        for action, body in (("confirm", None), ("assign-mechanic", {"mechanic_name": "Provision mechanic"}), ("start", None), ("complete", {"service_type": "Diagnostika"})):
            response = await client.patch(f"/api/v1/appointments/{appointment_id}/{action}", headers=reception, json=body)
            assert response.status_code == 200, response.text
        invoice = await client.post("/api/v1/invoices", headers=reception, json={"customer_id": customer_id, "vehicle_id": vehicle_id, "appointment_id": appointment_id, "tax_rate": 0, "line_items": [{"description": "Diagnostika", "quantity": 1, "unit_price": 150000}]})
        assert invoice.status_code == 201, invoice.text
        assert invoice.json()["currency"] == "UZS"
        invoice_id = invoice.json()["id"]
        recorded = await client.post(
            f"/api/v1/invoices/{invoice_id}/payments",
            headers={**reception, "Idempotency-Key": str(uuid.uuid4())},
            json={"amount": 1, "method": "cash"},
        )
        assert recorded.status_code == 201, recorded.text
        denied_refund = await client.post(
            f"/api/v1/invoices/{invoice_id}/payments",
            headers={**reception, "Idempotency-Key": str(uuid.uuid4())},
            json={"amount": 1, "method": "cash", "kind": "refund"},
        )
        denied_archive = await client.delete(f"/api/v1/invoices/{invoice_id}", headers=reception)
        denied_reports = await client.get("/api/v1/reports/executive", headers=reception)
        assert denied_refund.status_code == denied_archive.status_code == denied_reports.status_code == 403
        admin = await _login(client, config["staff"][0]["email"])
        refunded = await client.post(
            f"/api/v1/invoices/{invoice_id}/payments",
            headers={**admin, "Idempotency-Key": str(uuid.uuid4())},
            json={"amount": 1, "method": "cash", "kind": "refund"},
        )
        assert refunded.status_code == 201, refunded.text
        assert (await client.get("/api/v1/reports/executive", headers=admin)).status_code == 200
        linked = await client.get(f"/api/v1/appointments/{appointment_id}/invoice", headers=reception)
        assert linked.json()["id"] == invoice_id
        refused = await client.post("/api/v1/customers", headers=mechanic, json={"full_name": "Refused", "phone": "+998901234502"})
        assert refused.status_code == 403
        code, output, errors = await _command(path, apply=True, passwords=False)
        assert code == 0, errors
        invoices = await client.get("/api/v1/invoices", headers=reception)
        assert [item["id"] for item in invoices.json()["items"]] == [invoice_id]
        other = json.loads(json.dumps(config))
        other["service_center"]["email"] = f"other-{config['service_center']['email']}"
        for staff in other["staff"]:
            staff["email"] = f"other-{staff['email']}"
        path.write_text(json.dumps(other), encoding="utf-8")
        code, output, errors = await _command(path, apply=True)
        assert code == 0, errors
        second = await _login(client, other["staff"][0]["email"])
        for route, identity in (("customers", customer_id), ("vehicles", vehicle_id), ("appointments", appointment_id), ("invoices", invoice_id)):
            suffix = "/health" if route == "vehicles" else ""
            foreign = await client.get(f"/api/v1/{route}/{identity}{suffix}", headers=second)
            assert foreign.status_code == 404, foreign.text


async def test_suspended_global_role_is_not_reactivated(manifest):
    config, path = manifest
    code, _, errors = await _command(path, apply=True)
    assert code == 0, errors
    async with async_session_factory() as session:
        role_id = await session.scalar(select(Role.id).where(Role.name == "admin"))
        await session.execute(update(Role).where(Role.id == role_id).values(is_active=False))
        await session.commit()
    try:
        code, _, errors = await _command(path, apply=True)
        assert code == 2
        assert "role is suspended" in errors
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.post("/api/v1/auth/login", json={"email": config["staff"][0]["email"], "password": PASSWORD})
            assert denied.status_code == 401
    finally:
        async with async_session_factory() as session:
            await session.execute(update(Role).where(Role.id == role_id).values(is_active=True))
            await session.commit()


@pytest.mark.parametrize("kind", ["garage", "staff"])
async def test_ambiguous_legacy_email_variants_require_resolution(manifest, kind):
    config, path = manifest
    code, _, errors = await _command(path, apply=True)
    assert code == 0, errors
    async with async_session_factory() as session:
        if kind == "garage":
            session.add(ServiceCenter(name="Legacy duplicate", email=config["service_center"]["email"].upper()))
        else:
            original = await session.scalar(select(User).where(User.email == config["staff"][0]["email"]))
            session.add(User(service_center_id=original.service_center_id, role_id=original.role_id,
                             email=original.email.upper(), full_name=original.full_name,
                             password_hash=hash_password(PASSWORD), is_super_admin=False))
        await session.commit()
    code, output, errors = await _command(path, apply=True)
    assert code == 2
    assert "Ambiguous" in errors
    assert PASSWORD not in output + errors


async def test_normalized_manifest_and_bcrypt_byte_boundary_can_sign_in(manifest):
    config, path = manifest
    config["service_center"]["email"] = config["service_center"]["email"].upper()
    for staff in config["staff"]:
        staff["email"] = staff["email"].upper()
    path.write_text(json.dumps(config), encoding="utf-8")
    password = "a" * 72
    code, output, errors = await _command(path, apply=True, password_value=password)
    assert code == 0, errors
    result = json.loads(output)
    assert result["service_center"]["email"] == config["service_center"]["email"].lower()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await _login(client, config["staff"][0]["email"].lower(), password)
