from tests.test_staff_access_lifecycle import client, identity  # noqa: F401
from tests.test_staff_management_api import owner  # noqa: F401
from tests.test_customer_mobile_accounts import sms_box, _garage_customer, _signup  # noqa: F401


async def test_password_customers_use_owned_portal_without_legacy_route_whitelist(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    signup = await _signup(client, sms_box, phone, email)
    assert signup.status_code == 201
    headers = {'Authorization': 'Bearer ' + signup.json()['access_token']}
    for path in ('vehicles', 'appointments/today', 'billing'):
        result = await client.get('/api/v1/customer/' + path, headers=headers)
        assert result.status_code == 200, result.text

    assert (await client.post('/api/v1/customer/vehicles', headers=headers, json={})).status_code == 405
    assert (await client.patch('/api/v1/customer/appointments', headers=headers, json={})).status_code == 405
    assert (await client.get('/api/v1/customer/billing', headers=owner)).status_code == 401
