"""Invoice volume fixture; runs only in the owned production QA environment."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import math
import os
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, '/app')
from recovery_fixture import guard, identity

CUSTOMERS = 1000
INVOICES = 10000


async def seed_volume():
    from sqlalchemy import func, insert, select, text
    from app.core.database import async_session_factory, engine
    from app.models import Customer, Invoice, Vehicle
    guard()
    async with async_session_factory() as session:
        if await session.scalar(select(func.count()).select_from(Invoice)) != 2:
            raise RuntimeError('Volume seed requires the untouched two-invoice QA fixture')
        for suffix in ('a', 'b'):
            center = identity('center-' + suffix)
            customers = [{'id': identity(f'volume-customer-{suffix}-{i}'), 'service_center_id': center,
                          'full_name': f'Volume customer {i:04}', 'phone': f'+99891{i:07}'}
                         for i in range(CUSTOMERS)]
            await session.execute(insert(Customer), customers)
            vehicles = [{'id': identity(f'volume-vehicle-{suffix}-{i}'), 'service_center_id': center,
                         'customer_id': customers[i]['id'], 'vehicle_model_id': identity('model'),
                         'year': 2021, 'license_plate': f'QA {i:04}'} for i in range(CUSTOMERS)]
            await session.execute(insert(Vehicle), vehicles)
            for start in range(0, INVOICES, 1000):
                rows = []
                for i in range(start, start + 1000):
                    related = i % CUSTOMERS
                    rows.append({'id': identity(f'volume-invoice-{suffix}-{i}'),
                                 'service_center_id': center, 'customer_id': customers[related]['id'],
                                 'vehicle_id': vehicles[related]['id'], 'code': f'VOLUME-{suffix}-{i:05}',
                                 'kind': 'invoice', 'status': 'issued', 'currency': 'UZS',
                                 'subtotal': 100000, 'total': 100000, 'amount_paid': 0, 'balance': 100000,
                                 'created_at': datetime(2020, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=i)})
                await session.execute(insert(Invoice), rows)
        await session.commit()
        # Bulk fixture insertion should have planner statistics like a used database.
        await session.execute(text('ANALYZE'))
        counts = {}
        for model in (Customer, Vehicle, Invoice):
            counts[model.__tablename__] = await session.scalar(select(func.count()).select_from(model))
    await engine.dispose()
    print(json.dumps({'counts': counts, 'additional_invoices_per_garage': INVOICES,
                      'additional_customers_per_garage': CUSTOMERS, 'qa_only': True}))


async def query_profile():
    from sqlalchemy import event
    from app.core.database import engine
    from app.repositories.unit_of_work import UnitOfWork
    from app.services.invoice_service import InvoiceService
    guard()
    measurements = []
    for size in (5, 30, 100):
        count = 0
        def executed(*args):
            nonlocal count
            count += 1
        event.listen(engine.sync_engine, 'before_cursor_execute', executed)
        try:
            started = time.perf_counter()
            async with UnitOfWork(identity('center-a')) as uow:
                result = await InvoiceService(uow).list_documents(page_size=size)
            elapsed = time.perf_counter() - started
        finally:
            event.remove(engine.sync_engine, 'before_cursor_execute', executed)
        assert len(result['items']) == size and result['total'] == INVOICES + 1
        assert all(item['customer_name'] and item['vehicle_label'] for item in result['items'])
        measurements.append({'page_size': size, 'sql_statements': count, 'seconds': elapsed})
    await engine.dispose()
    print(json.dumps({'pages': measurements}))


def http_profile():
    guard()
    from app.core.config import settings
    assert settings.RATE_LIMIT_ENABLED and not settings.DEBUG
    host = os.environ['GARAGEOS_VOLUME_API_HOST']
    if not host.startswith(os.environ['GARAGEOS_RECOVERY_RUN'] + '-api-'):
        raise RuntimeError('Volume probe must target its owned QA backend')
    origin = f'http://{host}:8000/api/v1'
    password = os.environ['GARAGEOS_RECOVERY_PASSWORD']
    def request(path, token=None, body=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None if body is None else json.dumps(body).encode()
        with urlopen(Request(origin + path, headers=headers, data=data), timeout=30) as response:
            content = response.read()
            assert response.status == 200
            return json.loads(content), len(content)
    staff = request('/auth/login', body={'email': 'recovery-staff-a@example.com', 'password': password})[0]['access_token']
    customer = request('/customer/auth/login', body={'email': 'recovery-customer-a@example.com', 'password': password})[0]['access_token']
    scenarios = [
        ('first-30', {'page': 1, 'page_size': 30}, 30, INVOICES + 1),
        ('deep-30', {'page': 300, 'page_size': 30}, 30, INVOICES + 1),
        ('maximum-100', {'page_size': 100}, 100, INVOICES + 1),
        ('old-code', {'q': 'VOLUME-a-00000', 'page_size': 30}, 1, 1),
        ('customer-search', {'q': 'Volume customer 0999', 'page_size': 30}, 10, 10),
        ('plate-search', {'q': 'QA 0999', 'page_size': 30}, 10, 10),
        ('literal-empty', {'q': '%', 'page_size': 30}, 0, 0),
        ('foreign-code', {'q': 'VOLUME-b-', 'page_size': 30}, 0, 0),
    ]
    def one(scenario):
        name, params, size, total = scenario
        started = time.perf_counter()
        result, length = request('/invoices?' + urlencode(params), staff)
        elapsed = time.perf_counter() - started
        assert result['total'] == total and len(result['items']) == size
        assert result['kpis']['outstanding'] == INVOICES * 100000 + 200000
        assert result['counts']['invoices'] == INVOICES + 1
        assert all(item['customer_id'] != str(identity('customer-b')) for item in result['items'])
        assert all(not item['code'].startswith('VOLUME-b-') for item in result['items'])
        assert length < 200000
        return {'scenario': name, 'seconds': elapsed, 'response_bytes': length}
    for scenario in scenarios:
        one(scenario)  # Explicit warm-up, still validates correctness.
    batches = {}
    for concurrency in (1, 5):
        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=concurrency) as workers:
            samples = list(workers.map(one, scenarios * 5))
        wall = time.perf_counter() - started
        durations = sorted(sample['seconds'] for sample in samples)
        per_scenario = {}
        for name, *_ in scenarios:
            values = sorted(sample['seconds'] for sample in samples if sample['scenario'] == name)
            per_scenario[name] = {'samples': len(values), 'min': values[0], 'p50': values[math.ceil(len(values)*.5)-1],
                                  'p95': values[math.ceil(len(values)*.95)-1], 'max': values[-1]}
        batches[str(concurrency)] = {'samples': len(samples), 'errors': 0, 'wall_seconds': wall,
                                    'requests_per_second': len(samples)/wall,
                                    'p50': durations[math.ceil(len(durations)*.5)-1],
                                    'p95': durations[math.ceil(len(durations)*.95)-1],
                                    'max': durations[-1], 'per_scenario': per_scenario,
                                    'max_response_bytes': max(sample['response_bytes'] for sample in samples)}
    history = request('/customer/history/invoices', customer)[0]
    assert history['total'] == 1 and history['items'][0]['id'] == str(identity('invoice-a'))
    print(json.dumps({'batches': batches, 'warmup_requests': len(scenarios),
                      'rate_limit_enabled': settings.RATE_LIMIT_ENABLED, 'customer_history_scoped': True,
                      'qa_only': True, 'client_performance_verified': False}))


if __name__ == '__main__':
    if sys.argv[1:] == ['seed-volume']:
        asyncio.run(seed_volume())
    elif sys.argv[1:] == ['query-profile']:
        asyncio.run(query_profile())
    elif sys.argv[1:] == ['http-profile']:
        http_profile()
    else:
        raise SystemExit('Use seed-volume, query-profile or http-profile inside the owned QA environment')
