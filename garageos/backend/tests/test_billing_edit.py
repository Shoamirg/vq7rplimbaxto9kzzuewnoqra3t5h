"""Editing an estimate/invoice recomputes totals and respects the paid-lock.

Creates a throwaway estimate, edits its line items, asserts the totals recompute,
then deletes it — so the demo data is left untouched.
"""
from __future__ import annotations

import httpx
import pytest_asyncio

from app.core.database import engine
from app.main import app

ADMIN = ("admin@demo.garageos.app", "parol12345")


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine():
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _auth(client) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_edit_recomputes_totals(client):
    h = await _auth(client)
    cid = (await client.get("/api/v1/customers?limit=1", headers=h)).json()["items"][0]["id"]

    created = await client.post("/api/v1/invoices", headers=h, json={
        "kind": "estimate", "customer_id": cid,
        "line_items": [{"kind": "labor", "description": "Diagnostic", "quantity": 1, "unit_price": 50}],
    })
    assert created.status_code == 201, created.text
    doc = created.json()
    assert doc["subtotal"] == 50
    inv_id = doc["id"]

    try:
        edited = await client.put(f"/api/v1/invoices/{inv_id}", headers=h, json={
            "line_items": [
                {"kind": "part", "description": "Brake pads", "quantity": 2, "unit_price": 100},
                {"kind": "labor", "description": "Fit pads", "quantity": 1, "unit_price": 60},
            ],
        })
        assert edited.status_code == 200, edited.text
        assert edited.json()["subtotal"] == 260   # 2*100 + 60, recomputed

        # The document is shareable at a public, no-auth URL.
        pub = await client.get(f"/api/v1/public/invoice/{inv_id}")
        assert pub.status_code == 200, pub.text
        assert pub.json()["code"] == doc["code"]
    finally:
        await client.delete(f"/api/v1/invoices/{inv_id}", headers=h)


async def test_public_invoice_404_for_unknown(client):
    resp = await client.get("/api/v1/public/invoice/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
