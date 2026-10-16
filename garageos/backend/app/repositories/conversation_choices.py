"""Minimal eligible Inbox choices; context validation never loads ORM history."""
from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import String, bindparam, case, cast, func, or_, select
from sqlalchemy.sql import quoted_name

from app.models.appointment import Appointment
from app.models.brand import Brand
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.operational_case import OperationalCase
from app.models.role import Role
from app.models.service_center import ServiceCenter
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.inbox_query import local_vehicle_exists, optional_local, require_search_collation
from app.repositories.tenant_references import local_reference_exists

ChoiceKind = Literal['customer', 'vehicle', 'appointment', 'case', 'invoice', 'assignee']
ELIGIBLE_ROLES = ('admin', 'manager', 'receptionist', 'mechanic', 'super_admin')
MODELS = {'customer': Customer, 'vehicle': Vehicle, 'appointment': Appointment,
          'case': OperationalCase, 'invoice': Invoice, 'assignee': User}
CONTEXT_FIELDS = {'customer': 'customer_id', 'vehicle': 'vehicle_id',
                  'appointment': 'appointment_id', 'case': 'case_id',
                  'invoice': 'invoice_id', 'assignee': 'assigned_user_id'}
WHITESPACE = '\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000'


def choice_statement(kind: ChoiceKind, center: uuid.UUID):
    model = MODELS[kind]
    predicates = [model.service_center_id == center, model.is_active.is_(True)]
    metadata = []
    if kind in ('customer', 'assignee'):
        recorded_label = model.full_name
    elif kind == 'vehicle':
        name = func.btrim(func.concat(func.coalesce(Brand.name, ''), ' ',
                                     func.coalesce(VehicleModel.name, '')), WHITESPACE)
        recorded_label = case(
            (or_(Vehicle.license_plate.is_(None), Vehicle.license_plate == ''), name),
            else_=func.concat(name, ' (', Vehicle.license_plate, ')'))
    elif kind == 'appointment':
        center_timezone = select(ServiceCenter.timezone).where(ServiceCenter.id == center).scalar_subquery()
        recorded_label = func.concat(cast(func.timezone(center_timezone, Appointment.appointment_date), String),
                                     ' ', Appointment.appointment_time)
    elif kind == 'case':
        recorded_label = func.concat(OperationalCase.code, ' — ', OperationalCase.title)
    else:
        recorded_label = Invoice.code
    # A legacy blank display name does not invent a person or hide a valid UUID.
    label = func.coalesce(func.nullif(func.btrim(recorded_label, WHITESPACE), ''),
                          cast(model.id, String)).label('label')
    if kind == 'vehicle':
        predicates.append(local_reference_exists(Customer, Vehicle.customer_id, center))
        metadata = [Vehicle.customer_id]
    elif kind in ('appointment', 'case', 'invoice'):
        predicates.extend((optional_local(Customer, model.customer_id, center),
                           or_(model.vehicle_id.is_(None), local_vehicle_exists(model.vehicle_id, center))))
        metadata = [model.customer_id, model.vehicle_id]
        if kind == 'case':
            predicates.append(optional_local(User, OperationalCase.assigned_user_id, center))
    elif kind == 'assignee':
        predicates.extend((Role.is_active.is_(True), Role.name.in_(ELIGIBLE_ROLES)))
        metadata = [Role.name.label('role')]
    statement = select(model.id, label, *metadata).select_from(model).where(*predicates)
    if kind == 'vehicle':
        statement = statement.outerjoin(VehicleModel, VehicleModel.id == Vehicle.vehicle_model_id
            ).outerjoin(Brand, Brand.id == VehicleModel.brand_id)
    elif kind == 'assignee':
        statement = statement.join(Role, Role.id == User.role_id)
    return statement


async def selected_coordinates(session, center: uuid.UUID, context: dict):
    """Validate every supplied reference before projecting any candidates/counts.

    Match public creation: direct vehicle selection captures its current owner;
    owning appointment/case/invoice selections retain their recorded coordinates.
    Historical nested owners/vehicles/staff may be inactive but must remain local.
    Scalar projections avoid Customer/Vehicle/Invoice selectin history loading.
    """
    customers, vehicles = set(), set()
    for kind, field in CONTEXT_FIELDS.items():
        target = context.get(field)
        if target is None:
            continue
        statement = choice_statement(kind, center).where(MODELS[kind].id == target)
        row = (await session.execute(statement)).mappings().one_or_none()
        if row is None:
            return None
        if kind == 'customer':
            customers.add(row['id'])
        elif kind == 'vehicle':
            vehicles.add(row['id'])
            customers.add(row['customer_id'])
        elif kind in ('appointment', 'case', 'invoice'):
            if row['customer_id'] is not None:
                customers.add(row['customer_id'])
            if row['vehicle_id'] is not None:
                vehicles.add(row['vehicle_id'])
    return customers, vehicles


async def choice_page(session, center: uuid.UUID, *, kind: ChoiceKind, q: str | None,
                      limit: int, offset: int, customer: uuid.UUID | None,
                      vehicle: uuid.UUID | None):
    statement = choice_statement(kind, center)
    model = MODELS[kind]
    if kind == 'customer' and customer is not None:
        statement = statement.where(Customer.id == customer)
    elif kind == 'vehicle':
        if customer is not None:
            statement = statement.where(Vehicle.customer_id == customer)
        if vehicle is not None:
            statement = statement.where(Vehicle.id == vehicle)
    elif kind in ('appointment', 'case', 'invoice'):
        if customer is not None:
            statement = statement.where(or_(model.customer_id.is_(None), model.customer_id == customer))
        if vehicle is not None:
            statement = statement.where(or_(model.vehicle_id.is_(None), model.vehicle_id == vehicle))
    if q:
        await require_search_collation(session)
        pattern = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        bound = bindparam('conversation_choice_search', pattern, type_=String())
        collation = quoted_name('pg_catalog."und-x-icu"', quote=False)
        statement = statement.where(or_(*(column.collate(collation).ilike(bound, escape='\\')
            for column in (statement.selected_columns.label, cast(model.id, String)))))
    total = int(await session.scalar(statement.with_only_columns(func.count(), maintain_column_froms=True)))
    rows = (await session.execute(statement.order_by(statement.selected_columns.label, model.id)
                                  .limit(limit).offset(offset))).mappings()
    items = [{name: str(value) if isinstance(value, uuid.UUID) else value
              for name, value in row.items()} for row in rows]
    return {'kind': kind, 'items': items, 'total': total, 'limit': limit,
            'offset': offset, 'has_more': offset + len(items) < total}
