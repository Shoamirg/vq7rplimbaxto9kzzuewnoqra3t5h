from app.api.customer_deps import password_customer_route_allowed


def test_password_customers_can_read_portal_data_and_submit_only_bookings():
    assert password_customer_route_allowed("GET", "/api/v1/customer/vehicles")
    assert password_customer_route_allowed("GET", "/api/v1/customer/appointments/today")
    assert password_customer_route_allowed("POST", "/api/v1/customer/appointments")

    assert not password_customer_route_allowed("POST", "/api/v1/customer/vehicles")
    assert not password_customer_route_allowed("PATCH", "/api/v1/customer/appointments")
    assert not password_customer_route_allowed("GET", "/api/v1/customer/billing")
