"""Synthetic recovery data/probes; invoked only inside the owned backend image."""
import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, '/app')  # Production image's application root; fixture is bind-mounted at /.


def identity(name):
    return uuid.uuid5(uuid.NAMESPACE_URL, 'garageos/recovery/' + name)


def guard():
    from sqlalchemy.engine import make_url
    from app.core.config import settings
    url = make_url(settings.DATABASE_URL)
    if (settings.ENVIRONMENT != 'production' or settings.DEBUG
            or url.database != 'garageos_recovery' or url.username != 'recovery_role'
            or url.host not in {'postgres', 'restored'}
            or not os.environ.get('GARAGEOS_RECOVERY_RUN', '').startswith('garageos-recovery-')):
        raise RuntimeError('Recovery fixture requires the isolated QA production database')


async def seed():
    from sqlalchemy import func, select
    from app.core.database import async_session_factory, engine
    from app.core.security import hash_password
    from app.models import (Appointment, Brand, Customer, CustomerAccount, Invoice,
                            InvoiceLineItem, LedgerEntry, Payment, Role, ServiceCenter,
                            ServiceRecord, User, Vehicle, VehicleModel, Conversation)
    guard()
    when = datetime(2026, 10, 8, tzinfo=timezone.utc)
    password = os.environ['GARAGEOS_RECOVERY_PASSWORD']
    async with async_session_factory() as session:
        if await session.scalar(select(func.count()).select_from(ServiceCenter)):
            raise RuntimeError('Refusing to seed a nonempty recovery database')
        role = Role(id=identity('role'), name='admin')
        brand = Brand(id=identity('brand'), name='Recovery QA')
        session.add_all([role, brand])
        await session.flush()
        model = VehicleModel(id=identity('model'), brand_id=brand.id, name='QA car', year_start=2010)
        session.add(model)
        for suffix in ('a', 'b'):
            center = ServiceCenter(id=identity('center-' + suffix), name='Recovery QA ' + suffix,
                                   email=f'garage-{suffix}@example.com')
            session.add(center)
            await session.flush()
            user = User(id=identity('user-' + suffix), service_center_id=center.id,
                        role_id=role.id, email=f'recovery-staff-{suffix}@example.com',
                        password_hash=hash_password(password), full_name='QA owner ' + suffix,
                        is_super_admin=False)
            customer = Customer(id=identity('customer-' + suffix), service_center_id=center.id,
                                full_name='QA customer ' + suffix, phone='+998900001234',
                                telegram_id=identity('telegram-' + suffix).int % 10**12)
            session.add_all([user, customer])
            await session.flush()
            account = CustomerAccount(id=identity('account-' + suffix), service_center_id=center.id,
                                      customer_id=customer.id, email=f'recovery-customer-{suffix}@example.com',
                                      password_hash=hash_password(password), version=7)
            vehicle = Vehicle(id=identity('vehicle-' + suffix), service_center_id=center.id,
                              customer_id=customer.id, vehicle_model_id=model.id, year=2021,
                              license_plate='01 QA 123', current_km=45000)
            session.add_all([account, vehicle])
            await session.flush()
            appointment = Appointment(id=identity('appointment-' + suffix), service_center_id=center.id,
                                      customer_id=customer.id, vehicle_id=vehicle.id,
                                      appointment_date=when, appointment_time='09:00', status='completed')
            session.add(appointment)
            await session.flush()
            session.add(ServiceRecord(service_center_id=center.id, vehicle_id=vehicle.id,
                                      appointment_id=appointment.id, service_type='QA diagnosis',
                                      performed_km=45000, performed_date=when, cost=300000))
            invoice = Invoice(id=identity('invoice-' + suffix), service_center_id=center.id,
                              customer_id=customer.id, vehicle_id=vehicle.id,
                              appointment_id=appointment.id, code='RECOVERY-' + suffix,
                              kind='invoice', status='partial', currency='UZS', subtotal=300000,
                              total=300000, amount_paid=100000, balance=200000, issued_at=when,
                              created_by_user_id=user.id, notes='QA private staff note')
            session.add(invoice)
            await session.flush()
            session.add(Conversation(id=identity('conversation-' + suffix), service_center_id=center.id,
                                     customer_id=customer.id, vehicle_id=vehicle.id,
                                     appointment_id=appointment.id, invoice_id=invoice.id,
                                     subject='Private recovery thread ' + suffix))
            session.add(InvoiceLineItem(service_center_id=center.id, invoice_id=invoice.id,
                                        kind='labor', description='QA diagnosis', quantity=1,
                                        unit_price=300000, line_total=300000))
            session.add(Payment(service_center_id=center.id, invoice_id=invoice.id,
                                amount=100000, kind='payment', method='cash', source='manual',
                                received_at=when, idempotency_key=str(identity('payment-key-' + suffix)),
                                created_by_user_id=user.id))
            for kind, direction, amount in [('invoice_issued', 'debit', 300000),
                                            ('payment_received', 'credit', 100000)]:
                session.add(LedgerEntry(service_center_id=center.id, customer_id=customer.id,
                                        invoice_id=invoice.id, entry_type=kind, direction=direction,
                                        amount=amount, currency='UZS', occurred_at=when))
        await session.commit()
    await engine.dispose()
    print('Seeded isolated two-garage recovery records; credentials withheld')


def probe():
    guard()
    password = os.environ['GARAGEOS_RECOVERY_PASSWORD']

    def request(path, token=None, body=None, headers=None, expected=200):
        content = None if body is None else json.dumps(body).encode()
        request_headers = {'Content-Type': 'application/json', **(headers or {})}
        if token:
            request_headers['Authorization'] = 'Bearer ' + token
        try:
            response = urlopen(Request('http://127.0.0.1:8000/api/v1' + path,
                                       data=content, headers=request_headers), timeout=10)
        except HTTPError as error:
            response = error
        with response:
            if response.status != expected:
                raise RuntimeError(f'Recovery API {path} returned {response.status}; expected {expected}')
            return json.load(response)

    staff = request('/auth/login', body={'email': 'recovery-staff-a@example.com',
                                         'password': password})['access_token']
    customer = request('/customer/auth/login', body={'email': 'recovery-customer-a@example.com',
                                                    'password': password})['access_token']
    assert request('/customer/me', customer)['id'] == str(identity('customer-a'))
    invoice_id = str(identity('invoice-a'))
    before = request('/invoices/' + invoice_id, staff)
    assert before['total'] == 300000 and before['amount_paid'] == 100000 and before['balance'] == 200000
    assert len(before['payments']) == 1
    # Restore must retain the idempotency key, not create another receipt.
    request('/invoices/' + invoice_id + '/payments', staff,
            body={'amount': 100000, 'method': 'cash', 'source': 'manual'},
            headers={'Idempotency-Key': str(identity('payment-key-a'))}, expected=201)
    after = request('/invoices/' + invoice_id, staff)
    assert after['amount_paid'] == 100000 and after['balance'] == 200000 and len(after['payments']) == 1
    history = request('/customer/history/invoices', customer)
    assert history['total'] == 1 and history['items'][0]['id'] == invoice_id
    detail = request('/customer/history/invoices/' + invoice_id, customer)
    assert detail['total'] == 300000 and detail['balance'] == 200000 and len(detail['payments']) == 1
    assert 'notes' not in detail
    other_id = str(identity('invoice-b'))
    request('/invoices/' + other_id, staff, expected=404)
    request('/customer/history/invoices/' + other_id, customer, expected=404)

    # Genuine Telegram sign-in, separate from the password customer's read-only
    # principal. Neither auth dependencies nor normal FK/UoW are bypassed.
    fields = {'auth_date': str(int(time.time())), 'user': json.dumps({
        'id': identity('telegram-a').int % 10**12, 'first_name': 'Recovery QA',
    })}
    secret = hmac.new(b'WebAppData', os.environ['TELEGRAM_BOT_TOKEN'].encode(), hashlib.sha256).digest()
    check = '\n'.join(f'{key}={fields[key]}' for key in sorted(fields))
    fields['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    telegram = request('/customer/auth/telegram', body={'init_data': urlencode(fields)})['access_token']
    conversation_id = str(identity('conversation-a'))
    message_path = '/conversations/' + conversation_id + '/messages'
    customer_message_path = '/customer/messages/' + conversation_id
    staff_payload = {'body': '  Retained staff message\nwith exact whitespace  ',
                     'attachments': [{'kind': 'document', 'label': 'Retained recovery attachment',
                                      'meta': {'locale': 'uz', 'ordered': [1, 2]}}]}
    staff_key = {'Idempotency-Key': str(identity('staff-message-key-a'))}
    customer_key = {'Idempotency-Key': str(identity('customer-message-key-a'))}
    staff_message = request(message_path, staff, body=staff_payload, headers=staff_key, expected=201)
    customer_message = request(customer_message_path, telegram, body={'body': 'Retained customer reply'}, headers=customer_key)
    assert request(message_path, staff, body=staff_payload, headers=staff_key, expected=201) == staff_message
    assert request(customer_message_path, telegram, body={'body': 'Retained customer reply'}, headers=customer_key) == customer_message
    assert len(staff_message['attachments']) == 1 and customer_message['attachments'] == []
    request(message_path, staff, body={'body': 'Different material content'}, headers=staff_key, expected=409)
    request(customer_message_path, telegram, body={'body': 'Different customer content'}, headers=customer_key, expected=409)
    request(message_path, staff, body=staff_payload, headers={'Idempotency-Key': ''}, expected=422)
    request(customer_message_path, telegram, body={'body': 'Invalid key'}, headers={'Idempotency-Key': 'invalid'}, expected=422)
    request('/conversations/' + str(identity('conversation-b')) + '/messages', staff,
            body=staff_payload, headers=staff_key, expected=404)
    request('/customer/messages/' + str(identity('conversation-b')), telegram,
            body={'body': 'Retained customer reply'}, headers=customer_key, expected=404)
    request(customer_message_path, customer, body={'body': 'Password cannot replay'}, headers=customer_key, expected=403)
    request(customer_message_path, staff, body={'body': 'Staff is not customer'}, headers=customer_key, expected=401)
    stored = asyncio.run(message_state())
    assert stored['messages'] == stored['intents'] == 2
    assert stored['attachments'] == stored['unread'] == 1
    assert set(stored['message_ids']) == {staff_message['id'], customer_message['id']}
    print(json.dumps({'staff_login': True, 'customer_login': True, 'customer_version': 7,
                      'invoice_total': after['total'], 'amount_paid': after['amount_paid'],
                      'balance': after['balance'], 'receipts': len(after['payments']),
                      'retained_payment_idempotency': True, 'tenant_denial': True,
                      'customer_invoice': detail, 'customer_history': history,
                      'staff_message_receipt': staff_message, 'customer_message_receipt': customer_message,
                      'message_state': stored, 'retained_message_intents': True}, sort_keys=True))


async def message_state():
    """Independent durable SQL observation, not a count inferred from HTTP."""
    from sqlalchemy import func, select
    from app.core.database import async_session_factory, engine
    from app.models import Attachment, Conversation, Message, MessageIntent
    guard()
    conversation_id = identity('conversation-a')
    async with async_session_factory() as session:
        conv = await session.get(Conversation, conversation_id)
        counts = {}
        for model, name in [(Message, 'messages'), (MessageIntent, 'intents'), (Attachment, 'attachments')]:
            counts[name] = await session.scalar(select(func.count()).select_from(model).where(
                model.conversation_id == conversation_id, model.service_center_id == identity('center-a')))
        counts.update(unread=conv.unread_messages,
                      message_ids=sorted(str(value) for value in await session.scalars(select(Message.id).where(
                          Message.conversation_id == conversation_id))),
                      attachment_ids=sorted(str(value) for value in await session.scalars(select(Attachment.id).where(
                          Attachment.conversation_id == conversation_id))),
                      last_message_at=conv.last_message_at.isoformat(), last_activity_at=conv.last_activity_at.isoformat())
    await engine.dispose()
    return counts


if __name__ == '__main__':
    if sys.argv[1:] == ['seed']:
        asyncio.run(seed())
    elif sys.argv[1:] == ['probe']:
        probe()
    else:
        raise SystemExit('Use seed or probe inside the isolated backend container')
