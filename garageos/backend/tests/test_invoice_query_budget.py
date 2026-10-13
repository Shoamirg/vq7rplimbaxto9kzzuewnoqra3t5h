"""Authenticated history must keep SQL work bounded as its page grows."""
import uuid
from datetime import datetime, timezone

import pytest_asyncio
from sqlalchemy import delete, event, insert

from app.core.database import async_session_factory, engine
from tests.support.auth_sessions import persisted_access
from app.models import Brand, Customer, Invoice, ServiceCenter, Vehicle, VehicleModel
from tests.test_staff_access_lifecycle import _as_role, client, identity


@pytest_asyncio.fixture
async def distinct_history(identity):
    await _as_role(identity, 'admin')
    center = identity['center']
    brand_id, model_id, foreign_center, foreign_customer, foreign_vehicle = [uuid.uuid4() for _ in range(5)]
    customers, vehicles, invoices = [], [], []
    expected = {}
    for i in range(100):
        customer_id, vehicle_id, invoice_id = [uuid.uuid4() for _ in range(3)]
        customers.append({'id': customer_id, 'service_center_id': center,
                          'full_name': f'Budget customer {i:03}', 'is_active': i != 0})
        vehicles.append({'id': vehicle_id, 'service_center_id': center, 'customer_id': customer_id,
                         'vehicle_model_id': model_id, 'year': 2020,
                         'license_plate': f'BUDGET-{i:03}', 'is_active': i != 1})
        code = f'BUDGET-{i:03}'
        invoices.append({'id': invoice_id, 'service_center_id': center, 'code': code,
                         'customer_id': foreign_customer if i == 98 else customer_id,
                         'vehicle_id': None if i == 97 else foreign_vehicle if i in (98, 99) else vehicle_id,
                         'kind': 'invoice', 'status': 'issued', 'currency': 'UZS',
                         'subtotal': 100000, 'total': 100000, 'balance': 100000,
                         'created_at': datetime(2020, 1, 1, tzinfo=timezone.utc)})
        expected[code] = {'customer_name': None if i == 98 else f'Budget customer {i:03}',
                          'vehicle_label': None if i in (1, 98, 99) else f'Budget brand Budget car (BUDGET-{i:03})',
                          'vehicle_absent': i == 97, 'id': str(invoice_id)}
    async with async_session_factory() as session:
        await session.execute(insert(Brand), [{'id': brand_id, 'name': 'Budget brand'}])
        await session.execute(insert(VehicleModel), [{'id': model_id, 'brand_id': brand_id, 'name': 'Budget car'}])
        await session.execute(insert(ServiceCenter), [{'id': foreign_center, 'name': 'Foreign budget garage'}])
        await session.execute(insert(Customer), customers + [{'id': foreign_customer, 'service_center_id': foreign_center,
                                                              'full_name': 'PRIVATE FOREIGN CUSTOMER'}])
        await session.execute(insert(Vehicle), vehicles + [{'id': foreign_vehicle, 'service_center_id': foreign_center,
                                                            'customer_id': foreign_customer, 'vehicle_model_id': model_id,
                                                            'year': 2020, 'license_plate': 'PRIVATE-FOREIGN'}])
        await session.execute(insert(Invoice), invoices + [{'service_center_id': foreign_center, 'code': 'FOREIGN-DOCUMENT',
                                                            'customer_id': foreign_customer, 'kind': 'invoice', 'status': 'issued',
                                                            'currency': 'UZS', 'total': 900000, 'balance': 900000}])
        await session.commit()
    token = await persisted_access({'sub': str(identity['user']), 'type': 'access'})
    try:
        yield {'headers': {'Authorization': 'Bearer ' + token}, 'expected': expected}
    finally:
        async with async_session_factory() as session:
            await session.execute(delete(Vehicle).where(Vehicle.service_center_id == center))
            await session.execute(delete(ServiceCenter).where(ServiceCenter.id == foreign_center))
            await session.execute(delete(Brand).where(Brand.id == brand_id))
            await session.commit()


async def test_authenticated_invoice_page_query_work_and_projections_are_bounded(client, distinct_history):
    statements = []
    pages = []
    for size in (5, 100):
        count = 0
        def executed(*args):
            nonlocal count
            count += 1
        event.listen(engine.sync_engine, 'before_cursor_execute', executed)
        try:
            response = await client.get('/api/v1/invoices', headers=distinct_history['headers'],
                                        params={'page_size': size})
        finally:
            event.remove(engine.sync_engine, 'before_cursor_execute', executed)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['total'] == 100 and len(result['items']) == size
        assert result['counts']['invoices'] == 100 and result['kpis']['outstanding'] == 10000000
        assert 'PRIVATE' not in response.text and 'FOREIGN-DOCUMENT' not in response.text
        for item in result['items']:
            expected = distinct_history['expected'][item['code']]
            assert item['customer_name'] == expected['customer_name']
            if expected['vehicle_absent']:
                assert 'vehicle_label' not in item
            else:
                assert item['vehicle_label'] == expected['vehicle_label']
            assert item['total'] == item['balance'] == 100000 and item['amount_paid'] == 0
            assert 'customer' not in item and 'line_items' not in item and 'payments' not in item
        pages.append(result)
        statements.append(count)
    assert [item['id'] for item in pages[0]['items']] == [item['id'] for item in pages[1]['items'][:5]]
    detail = await client.get('/api/v1/invoices/' + distinct_history['expected']['BUDGET-002']['id'],
                              headers=distinct_history['headers'])
    assert detail.status_code == 200
    assert detail.json()['customer']['name'] == 'Budget customer 002'
    assert detail.json()['vehicle_label'] == 'Budget brand Budget car (BUDGET-002)'
    assert detail.json()['line_items'] == detail.json()['payments'] == []
    assert statements[-1] <= 25, f'100-row authenticated invoice page used {statements} statements'
    assert statements[-1] - statements[0] <= 5, f'Invoice statements grow with page size: {statements}'
