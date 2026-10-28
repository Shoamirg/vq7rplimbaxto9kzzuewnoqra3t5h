"""MVP regressions against PostgreSQL and the actual authorization boundary."""
import uuid
from sqlalchemy import func, select
from app.core.config import settings
from app.core.database import async_session_factory
from app.models import Customer, Invoice, Payment, LedgerEntry, ServiceCenter, Vehicle, VehicleModel
from app.models.audit_log import AuditLog
from app.models.operational_case import OperationalCase
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService, InvoiceFinancialStateError
from app.services.financial_service import FinancialService
from tests.test_staff_access_lifecycle import client, identity, PASSWORD  # noqa: F401
from tests.test_staff_management_api import owner  # noqa: F401
from tests.test_customer_mobile_accounts import sms_box, _garage_customer, _phone, _signup  # noqa: F401
import pytest


async def test_invoice_draft_is_not_debt_and_send_issues_exactly_once(session):
    center = ServiceCenter(name='MVP draft')
    session.add(center)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name='Synthetic customer')
    session.add(customer)
    await session.flush()
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    svc = InvoiceService(uow)
    draft = await svc.create(kind='invoice', customer_id=customer.id, draft=True, tax_rate=0,
        line_items=[{'description': 'Service', 'unit_price': 100, 'quantity': 1}])
    doc_id = uuid.UUID(draft['id'])
    assert draft['status'] == 'draft' and draft['issued_at'] is None
    assert (await FinancialService(uow).customer_summary(customer.id))['outstanding'] == 0
    assert await session.scalar(select(func.count()).select_from(LedgerEntry).where(
        LedgerEntry.invoice_id == doc_id)) == 0
    with pytest.raises(InvoiceFinancialStateError):
        await svc.record_payment(doc_id, amount=10)
    issued = await svc.send(doc_id)
    assert issued['status'] == 'issued'
    await svc.send(doc_id)
    assert (await FinancialService(uow).customer_summary(customer.id))['outstanding'] == 100
    assert await session.scalar(select(func.count()).select_from(LedgerEntry).where(
        LedgerEntry.invoice_id == doc_id, LedgerEntry.entry_type == 'invoice_issued')) == 1
    paid_page = await svc.list_documents(view='paid')
    assert paid_page['total'] == 0
    await svc.record_payment(doc_id, amount=100, method='cash')
    paid_page = await svc.list_documents(view='paid')
    assert paid_page['total'] == 1 and paid_page['items'][0]['id'] == str(doc_id)


async def test_issued_invoice_corrections_preserve_original_ledger(session):
    center = ServiceCenter(name='MVP immutable ledger')
    session.add(center)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name='Synthetic ledger customer')
    session.add(customer)
    await session.flush()
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    svc = InvoiceService(uow)
    def items(amount):
        return [{'description': 'Service', 'unit_price': amount, 'quantity': 1}]
    invoice = await svc.create(kind='invoice', customer_id=customer.id, tax_rate=0, line_items=items(100))
    invoice_id = uuid.UUID(invoice['id'])
    await svc.update(invoice_id, line_items=items(150))
    await svc.update(invoice_id, line_items=items(80))
    await svc.update(invoice_id, line_items=items(80))
    entries = list((await session.scalars(select(LedgerEntry).where(
        LedgerEntry.invoice_id == invoice_id))).all())
    assert len(entries) == 3
    original = next(row for row in entries if row.entry_type == 'invoice_issued')
    assert original.amount == 100
    assert sorted((row.direction, row.amount) for row in entries if row != original) == [('credit', 70), ('debit', 50)]
    assert sum(row.amount if row.direction == 'debit' else -row.amount for row in entries) == 80


async def test_signup_verification_is_server_checked_and_consumed_on_completion(client, identity, owner, sms_box):
    _, phone, email = await _garage_customer(client, owner)
    start = await client.post('/api/v1/customer/auth/signup/start', json={'email': email, 'phone': phone})
    assert start.status_code == 202
    code = sms_box.last_code()
    payload = {'email': email, 'phone': phone, 'code': code}
    wrong_code = '000000' if code != '000000' else '999999'
    wrong = await client.post('/api/v1/customer/auth/signup/verify', json={**payload, 'code': wrong_code})
    assert wrong.status_code == 400
    verified = await client.post('/api/v1/customer/auth/signup/verify', json=payload)
    assert verified.status_code == 200, verified.text
    assert verified.json()['garages'][0]['id'] == str(identity['center'])
    completed = await client.post('/api/v1/customer/auth/signup/complete',
        json={**payload, 'password': PASSWORD})
    assert completed.status_code == 201, completed.text
    replay = await client.post('/api/v1/customer/auth/signup/verify', json=payload)
    assert replay.status_code == 400


async def test_new_customer_enrollment_requires_opt_in_verified_code_and_garage(client, identity, owner, sms_box, monkeypatch):
    monkeypatch.setattr(settings, 'CUSTOMER_SELF_ENROLLMENT', True)
    phone, email = _phone(), f'enroll-{uuid.uuid4().hex}@example.com'
    await client.post('/api/v1/customer/auth/signup/start', json={'email': email, 'phone': phone})
    payload = {'email': email, 'phone': phone, 'code': sms_box.last_code(), 'password': PASSWORD,
               'service_center_id': str(identity['center']), 'full_name': 'New synthetic customer'}
    result = await client.post('/api/v1/customer/auth/signup/complete', json=payload)
    assert result.status_code == 201, result.text
    customer_id = result.json()['customer']['id']
    async with async_session_factory() as session:
        customer = await session.get(Customer, uuid.UUID(customer_id))
        assert customer.service_center_id == identity['center'] and customer.full_name == payload['full_name']


async def test_roadside_unknown_reply_retry_replays_one_case(client, identity, owner, sms_box):
    customer_id, phone, email = await _garage_customer(client, owner)
    async with async_session_factory() as session:
        model = await session.scalar(select(VehicleModel).limit(1))
        assert model is not None, 'Seed global reference data before integration tests'
        vehicle = Vehicle(service_center_id=identity['center'], customer_id=uuid.UUID(customer_id),
            vehicle_model_id=model.id, year=2023, license_plate='QA' + uuid.uuid4().hex[:8])
        session.add(vehicle)
        await session.commit()
        vehicle_id = str(vehicle.id)
    signup = await _signup(client, sms_box, phone, email)
    assert signup.status_code == 201
    headers = {'Authorization': 'Bearer ' + signup.json()['access_token'], 'Idempotency-Key': str(uuid.uuid4())}
    payload = {'description': 'flatTyre', 'vehicle_id': vehicle_id, 'location_lat': 41.3, 'location_lng': 69.2}
    first = await client.post('/api/v1/customer/roadside', headers=headers, json=payload)
    second = await client.post('/api/v1/customer/roadside', headers=headers, json=payload)
    assert first.status_code == second.status_code == 200, first.text
    assert first.json() == second.json()
    assert first.json()['location_lat'] == 41.3
    async with async_session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(OperationalCase).where(
            OperationalCase.customer_id == uuid.UUID(customer_id))) == 1
    mismatch = await client.post('/api/v1/customer/roadside', headers=headers,
        json={**payload, 'description': 'different request'})
    assert mismatch.status_code == 409


async def test_financial_outcomes_record_authenticated_actor_without_sensitive_payload(client, identity, owner):
    customer_id, _, _ = await _garage_customer(client, owner)
    created = await client.post('/api/v1/invoices', headers=owner, json={
        'kind': 'invoice', 'customer_id': customer_id, 'tax_rate': 0,
        'line_items': [{'description': 'Synthetic service', 'unit_price': 100, 'quantity': 1}]})
    assert created.status_code == 201, created.text
    invoice_id = uuid.UUID(created.json()['id'])
    paid = await client.post(f'/api/v1/invoices/{invoice_id}/payments',
        headers={**owner, 'Idempotency-Key': str(uuid.uuid4())},
        json={'amount': 100, 'method': 'cash'})
    assert paid.status_code == 201, paid.text
    async with async_session_factory() as session:
        invoice = await session.get(Invoice, invoice_id)
        payment = await session.scalar(select(Payment).where(Payment.invoice_id == invoice_id))
        assert invoice.created_by_user_id == payment.created_by_user_id == identity['user']
        audit = list((await session.scalars(select(AuditLog).where(
            AuditLog.resource_id == invoice_id, AuditLog.action.like('domain.%')))).all())
        assert {'domain.invoice_issued', 'domain.payment_received'} <= {row.action for row in audit}
        assert all(row.actor_user_id == identity['user'] for row in audit)
        assert all(set(row.context) <= {'event_id', 'actor_customer_id'} for row in audit)
