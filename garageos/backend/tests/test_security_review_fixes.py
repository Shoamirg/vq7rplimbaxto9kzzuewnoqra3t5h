"""Regression guards for the pre-deploy security review.

* The public invoice share link exposes only the printable document.
* Unknown login emails pay the same bcrypt cost as wrong passwords.
* Uvicorn never rewrites request.client from client-controlled headers.
"""
from __future__ import annotations

import shlex
from pathlib import Path

import httpx
import pytest_asyncio

from app.core.database import engine
from app.main import app

ADMIN = ("admin@demo.garageos.app", "parol12345")
PUBLIC_INVOICE_KEYS = {
    "id", "code", "kind", "status", "currency", "tax_rate", "subtotal",
    "discount_total", "tax_total", "total", "amount_paid", "balance",
    "issued_at", "due_date", "approved_at", "paid_at", "created_at",
    "is_overdue", "customer_name", "vehicle_label", "issuer", "line_items",
    "payments",
}


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine():
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_public_invoice_omits_customer_contact_and_staff_data(client):
    login = await client.post("/api/v1/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    customer_id = (await client.get("/api/v1/customers?limit=1", headers=headers)).json()["items"][0]["id"]
    created = await client.post("/api/v1/invoices", headers=headers, json={
        "kind": "estimate", "customer_id": customer_id, "notes": "staff-only: customer haggles",
        "line_items": [{"kind": "labor", "description": "Diagnostic", "quantity": 1, "unit_price": 50}],
    })
    assert created.status_code == 201, created.text
    doc = created.json()
    try:
        staff = await client.get(f"/api/v1/invoices/{doc['id']}", headers=headers)
        assert staff.json()["customer"]["phone"]  # staff view keeps full detail

        public = await client.get(f"/api/v1/public/invoice/{doc['id']}")
        assert public.status_code == 200, public.text
        data = public.json()
        assert set(data) <= PUBLIC_INVOICE_KEYS
        assert data["code"] == doc["code"] and data["line_items"][0]["description"] == "Diagnostic"
        body = public.text
        assert "staff-only" not in body
        assert staff.json()["customer"]["phone"] not in body
        for payment in data["payments"]:
            assert set(payment) <= {"kind", "method", "amount", "received_at"}
    finally:
        await client.delete(f"/api/v1/invoices/{doc['id']}", headers=headers)


async def test_staff_login_unknown_email_spends_password_check(client, monkeypatch):
    calls = []
    monkeypatch.setattr("app.services.auth_service.burn_password_check", calls.append)
    response = await client.post("/api/v1/auth/login",
                                 json={"email": "nobody@nowhere.example", "password": "whatever123"})
    assert response.status_code == 401
    assert calls == ["whatever123"]


async def test_customer_login_unknown_email_spends_password_check(client, monkeypatch):
    calls = []
    monkeypatch.setattr("app.services.customer_auth_service.burn_password_check", calls.append)
    response = await client.post("/api/v1/customer/auth/login",
                                 json={"email": "nobody@nowhere.example", "password": "whatever123"})
    assert response.status_code == 401
    assert calls == ["whatever123"]


def test_burn_password_check_runs_bcrypt(monkeypatch):
    from app.core import security
    seen = []
    real_verify = security.pwd_context.verify
    monkeypatch.setattr(security.pwd_context, "verify",
                        lambda secret, hashed: seen.append(hashed) or real_verify(secret, hashed))
    security.burn_password_check("anything")
    assert seen and seen[0].startswith("$2")


def test_uvicorn_does_not_trust_client_forwarding_headers():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile"
    cmd = next(line for line in dockerfile.read_text().splitlines() if line.startswith("CMD"))
    args = shlex.split(cmd)
    assert "--no-proxy-headers" in cmd
    assert "--forwarded-allow-ips" not in cmd and "--proxy-headers" not in [a.strip('"') for a in args]
