"""Invalid reception/payment inputs produce field errors, never HTTP 500."""
from uuid import uuid4

import httpx
import pytest

from app.api.deps import get_tenant_uow
from app.main import app


@pytest.mark.parametrize("amount", ["NaN", "Infinity", "-Infinity"])
async def test_nonfinite_payment_json_returns_422(amount):
    async def unused_uow():
        yield object()

    app.dependency_overrides[get_tenant_uow] = unused_uow
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/invoices/{uuid4()}/payments",
                content='{"amount":' + amount + '}',
                headers={"Content-Type": "application/json"},
            )
        assert response.status_code == 422
        error = response.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["detail"][0]["loc"][-1] == "amount"
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)


async def test_custom_name_validator_error_is_json_safe():
    async def unused_uow():
        yield object()

    app.dependency_overrides[get_tenant_uow] = unused_uow
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/v1/customers", json={"full_name": "    "})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)
