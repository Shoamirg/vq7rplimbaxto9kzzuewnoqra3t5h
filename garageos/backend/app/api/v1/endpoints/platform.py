"""Bounded, explicit business projections for platform operators."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.platform_deps import get_platform_db
from app.exceptions import ValidationError
from app.models import Appointment, Customer, Invoice, Payment, Role, ServiceCenter, User, Vehicle

router = APIRouter()
Kind = Literal['centers', 'staff', 'customers', 'vehicles', 'appointments', 'invoices', 'payments']


class Record(BaseModel):
    id: uuid.UUID
    service_center_id: uuid.UUID
    garage: str
    title: str
    is_active: bool
    fields: dict[str, str | None]


class Records(BaseModel):
    items: list[Record]
    total: int
    page: int
    page_size: int = 30


class MoneySummary(BaseModel):
    currency: str
    invoiced: str = '0'
    received: str = '0'
    refunds: str = '0'
    net_received: str = '0'


class Statistics(BaseModel):
    counts: dict[str, int]
    money: list[MoneySummary]


def _period(column, start: date | None, end: date | None):
    if start and end and start > end:
        raise ValidationError('Start date must not follow end date')
    if end == date.max:
        raise ValidationError('End date is outside supported range')
    conditions = []
    if start:
        conditions.append(column >= datetime.combine(start, datetime.min.time(), timezone.utc))
    if end:
        conditions.append(column < datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc))
    return conditions


def _definition(kind: Kind):
    # Only these selected columns can leave the platform read surface.
    if kind == 'centers':
        return ServiceCenter, ServiceCenter.name, {'email': ServiceCenter.email, 'timezone': ServiceCenter.timezone}, ServiceCenter.created_at
    if kind == 'staff':
        return User, User.full_name, {'email': User.email, 'role': Role.name}, User.created_at
    if kind == 'customers':
        return Customer, Customer.full_name, {'phone': Customer.phone}, Customer.created_at
    if kind == 'vehicles':
        return Vehicle, func.coalesce(Vehicle.license_plate, Vehicle.vin, cast(Vehicle.id, String)), {'vin': Vehicle.vin, 'year': Vehicle.year, 'customer_id': Vehicle.customer_id}, Vehicle.created_at
    if kind == 'appointments':
        return Appointment, Appointment.appointment_date, {'appointment_time': Appointment.appointment_time, 'status': Appointment.status, 'customer_id': Appointment.customer_id, 'vehicle_id': Appointment.vehicle_id, 'mechanic': Appointment.mechanic_name}, Appointment.appointment_date
    if kind == 'invoices':
        return Invoice, Invoice.code, {'kind': Invoice.kind, 'status': Invoice.status, 'currency': Invoice.currency, 'total': Invoice.total, 'balance': Invoice.balance, 'customer_id': Invoice.customer_id, 'issued_at': Invoice.issued_at}, Invoice.issued_at
    return Payment, Invoice.code, {'kind': Payment.kind, 'method': Payment.method, 'currency': Invoice.currency, 'amount': Payment.amount, 'received_at': Payment.received_at}, Payment.received_at


@router.get('/records/{kind}', response_model=Records)
async def records(
    kind: Kind,
    q: str = Query('', max_length=100),
    page: int = Query(1, ge=1, le=2147483647),
    center_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    db: AsyncSession = Depends(get_platform_db),
):
    model, title, fields, date_column = _definition(kind)
    center_column = ServiceCenter.id if kind == 'centers' else model.service_center_id
    query = select(model.id, center_column.label('service_center_id'), ServiceCenter.name.label('garage'),
                   title.label('title'), model.is_active, *[value.label(key) for key, value in fields.items()])
    if kind != 'centers':
        query = query.select_from(model).join(ServiceCenter, center_column == ServiceCenter.id)
    if kind == 'staff':
        query = query.join(Role, User.role_id == Role.id)
    if kind == 'payments':
        query = query.join(Invoice, (Invoice.id == Payment.invoice_id) & (Invoice.service_center_id == Payment.service_center_id))
    if center_id:
        query = query.where(center_column == center_id)
    query = query.where(*_period(date_column, start, end))
    if q.strip():
        literal = q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        search_columns = [title, ServiceCenter.name, *fields.values()]
        query = query.where(or_(*[cast(column, String).ilike(f'%{literal}%', escape='\\') for column in search_columns]))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(model.created_at.desc(), model.id).offset((page - 1) * 30).limit(30))).mappings()
    return Records(total=total, page=page, items=[Record(
        id=row['id'], service_center_id=row['service_center_id'], garage=row['garage'],
        title=row['title'].isoformat() if isinstance(row['title'], datetime) else row['title'], is_active=row['is_active'],
        fields={key: (value.isoformat() if isinstance(value, datetime) else str(value)) if value is not None else None
                for key, value in row.items() if key in fields},
    ) for row in rows])


@router.get('/stats', response_model=Statistics)
async def statistics(
    center_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    db: AsyncSession = Depends(get_platform_db),
):
    counts = {}
    for kind in ['centers', 'staff', 'customers', 'vehicles', 'appointments', 'invoices', 'payments']:
        model, _, _, period_column = _definition(kind)
        center_column = ServiceCenter.id if kind == 'centers' else model.service_center_id
        conditions = ([center_column == center_id] if center_id else []) + _period(period_column, start, end)
        counts[kind] = await db.scalar(select(func.count()).select_from(model).where(model.is_active.is_(True), *conditions))
    center_conditions = ([ServiceCenter.id == center_id] if center_id else []) + _period(ServiceCenter.created_at, start, end)
    counts['centers_total'] = await db.scalar(select(func.count()).select_from(ServiceCenter).where(*center_conditions))
    invoice_conditions = [Invoice.is_active.is_(True), Invoice.kind == 'invoice',
                          Invoice.status.in_(['issued', 'partial', 'paid', 'overdue', 'refunded'])]
    if center_id:
        invoice_conditions.append(Invoice.service_center_id == center_id)
    invoice_rows = (await db.execute(select(Invoice.currency, func.sum(Invoice.total)).where(
        *invoice_conditions, *_period(Invoice.issued_at, start, end)).group_by(Invoice.currency))).all()
    payment_rows = (await db.execute(select(Invoice.currency,
        func.sum(case((Payment.kind.in_(['payment', 'deposit']), Payment.amount), else_=0)),
        func.sum(case((Payment.kind == 'refund', Payment.amount), else_=0))).select_from(Payment).join(
            Invoice, (Invoice.id == Payment.invoice_id) & (Invoice.service_center_id == Payment.service_center_id)).where(
        *invoice_conditions, Payment.is_active.is_(True), *_period(Payment.received_at, start, end)).group_by(Invoice.currency))).all()
    money = {currency: MoneySummary(currency=currency, invoiced=str(total)) for currency, total in invoice_rows}
    for currency, received, refunds in payment_rows:
        item = money.setdefault(currency, MoneySummary(currency=currency))
        item.received, item.refunds = str(received), str(refunds)
        item.net_received = str(Decimal(received) - Decimal(refunds))
    return Statistics(counts=counts, money=[money[key] for key in sorted(money)])
