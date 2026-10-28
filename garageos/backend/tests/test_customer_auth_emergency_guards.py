"""Removed unverified sign-in/link routes stay absent in every environment."""
import httpx
import pytest
from app.core.config import settings
from app.main import app
from app.services.customer_auth_service import CustomerAuthService

@pytest.mark.parametrize('environment', ['development', 'production'])
@pytest.mark.parametrize('path', ['dev', 'link'])
async def test_unverified_customer_auth_routes_are_absent(monkeypatch, environment, path):
    monkeypatch.setattr(settings, 'ENVIRONMENT', environment)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/customer/auth/' + path,
            json={'init_data': 'untrusted', 'phone': '+998900000000'})
    assert response.status_code == 404
    assert not hasattr(CustomerAuthService, 'dev_authenticate')
    assert not hasattr(CustomerAuthService, 'link_by_phone')
