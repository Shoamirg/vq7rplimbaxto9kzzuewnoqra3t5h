"""Scalar Inbox read model: one safe filtered set for counts and stable pages."""
from __future__ import annotations

import uuid
from itertools import combinations
from datetime import datetime, timezone

from sqlalchemy import String, and_, bindparam, case, cast, func, or_, select, text
from sqlalchemy.sql import quoted_name

from app.exceptions import GarageException
from app.models.appointment import Appointment
from app.models.brand import Brand
from app.models.conversation import Attachment, Conversation, ConvStatus, Message, Participant
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.operational_case import OPEN_CASE_STATUSES, OperationalCase
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.tenant_references import local_reference_exists
from app.services.vehicle_health_service import format_vehicle_label

OPEN_STATUSES = (ConvStatus.OPEN, ConvStatus.WAITING_CUSTOMER,
                 ConvStatus.WAITING_TECHNICIAN, ConvStatus.WAITING_APPROVAL)


def sla_tracking_active(conversation_status, case_status, case_is_active):
    return bool(conversation_status in OPEN_STATUSES and case_is_active
        and case_status in OPEN_CASE_STATUSES)


class InboxSearchUnavailable(GarageException):
    status_code = 503
    code = 'INBOX_SEARCH_UNAVAILABLE'
    detail = 'Inbox search requires an available deterministic ICU casefold collation'


def optional_local(model, reference, center):
    return or_(reference.is_(None), local_reference_exists(model, reference, center))


def local_vehicle_exists(reference, center):
    return select(Vehicle.id).where(
        Vehicle.id == reference, Vehicle.service_center_id == center,
        local_reference_exists(Customer, Vehicle.customer_id, center),
    ).correlate_except(Vehicle).exists()


def safe_conversation(center):
    """Historical reads preserve local inactive links and captured ownership.

    A compromised reference or child excludes the aggregate before counts/page.
    New-reference eligibility is a separate write boundary; history is not rewritten here.
    """
    predicates = [Conversation.service_center_id == center, Conversation.is_active.is_(True)]
    for model, reference in [(Customer, Conversation.customer_id), (Vehicle, Conversation.vehicle_id),
                             (User, Conversation.assigned_user_id)]:
        predicates.append(optional_local(model, reference, center))
    # A vehicle's present owner may differ from the captured conversation owner,
    # but both identities must still be local to the owning garage.
    predicates.append(or_(Conversation.vehicle_id.is_(None), local_vehicle_exists(Conversation.vehicle_id, center)))
    owning_links = [(OperationalCase, Conversation.case_id),
                   (Appointment, Conversation.appointment_id), (Invoice, Conversation.invoice_id)]
    for model, reference in owning_links:
        linked = [model.id == reference, model.service_center_id == center,
            optional_local(Customer, model.customer_id, center),
            or_(model.vehicle_id.is_(None), local_vehicle_exists(model.vehicle_id, center)),
            or_(Conversation.customer_id.is_(None), model.customer_id.is_(None), model.customer_id == Conversation.customer_id),
            or_(Conversation.vehicle_id.is_(None), model.vehicle_id.is_(None), model.vehicle_id == Conversation.vehicle_id)]
        if model is OperationalCase:
            linked.append(optional_local(User, model.assigned_user_id, center))
        predicates.append(or_(reference.is_(None), select(model.id).where(*linked).correlate_except(model).exists()))
    # Optional aggregate context cannot make contradictory owning snapshots
    # safe. Compare only recorded nonmissing coordinates, preserving absent
    # optional links and local historical vehicle transfers.
    for (left, left_id), (right, right_id) in combinations(owning_links, 2):
        incompatible = select(left.id).select_from(left).join(right, right.id == right_id).where(
            left.id == left_id, left.service_center_id == center, right.service_center_id == center,
            or_(and_(left.customer_id.is_not(None), right.customer_id.is_not(None), left.customer_id != right.customer_id),
                and_(left.vehicle_id.is_not(None), right.vehicle_id.is_not(None), left.vehicle_id != right.vehicle_id)),
        ).correlate_except(left, right).exists()
        predicates.append(~incompatible)
    bad_participant = select(Participant.id).where(Participant.conversation_id == Conversation.id, or_(
        Participant.service_center_id != center,
        ~optional_local(Customer, Participant.customer_id, center),
        ~optional_local(User, Participant.user_id, center),
    )).correlate_except(Participant).exists()
    bad_message = select(Message.id).where(Message.conversation_id == Conversation.id, or_(
        Message.service_center_id != center, ~optional_local(User, Message.author_user_id, center),
    )).correlate_except(Message).exists()
    bad_attachment = select(Attachment.id).outerjoin(Message, Attachment.message_id == Message.id).where(
        or_(Attachment.conversation_id == Conversation.id, Message.conversation_id == Conversation.id),
        or_(Attachment.service_center_id != center, Message.id.is_(None),
            Message.service_center_id != center, Attachment.conversation_id != Message.conversation_id),
    ).correlate_except(Attachment, Message).exists()
    return (*predicates, ~bad_participant, ~bad_message, ~bad_attachment)


def view_predicates(center, user_id, now):
    open_ = Conversation.status.in_(OPEN_STATUSES)
    # jsonb_array_length must not evaluate an invalid legacy scalar/object.
    mentions = case((func.jsonb_typeof(Message.mentions) == 'array',
                     func.jsonb_array_length(Message.mentions)), else_=0)
    has_mentions = select(Message.id).where(Message.conversation_id == Conversation.id,
        Message.service_center_id == center, mentions > 0).correlate_except(Message).exists()
    overdue = select(OperationalCase.id).where(OperationalCase.id == Conversation.case_id,
        OperationalCase.service_center_id == center, OperationalCase.is_active.is_(True),
        OperationalCase.status.in_(OPEN_CASE_STATUSES),
        OperationalCase.created_at + OperationalCase.sla_response_minutes * text("INTERVAL '1 minute'") < now,
    ).correlate_except(OperationalCase).exists()
    return {
        'all': text('true'), 'needs_reply': Conversation.status == ConvStatus.OPEN,
        'assigned_me': and_(Conversation.assigned_user_id == user_id, open_),
        'mentions': and_(open_, has_mentions),
        'waiting_customer': Conversation.status == ConvStatus.WAITING_CUSTOMER,
        'waiting_technician': Conversation.status == ConvStatus.WAITING_TECHNICIAN,
        'waiting_approval': Conversation.status == ConvStatus.WAITING_APPROVAL,
        'sla_breached': and_(open_, overdue),
        'unread': or_(Conversation.unread_messages > 0, Conversation.unread_activity > 0),
        'resolved': Conversation.status == ConvStatus.RESOLVED,
        'snoozed': Conversation.status == ConvStatus.SNOOZED,
    }


async def require_search_collation(session):
    available = await session.scalar(text('''
        SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_collation c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace
            JOIN pg_catalog.pg_database d ON d.datname = current_database()
            WHERE n.nspname = 'pg_catalog' AND c.collname = 'und-x-icu'
              AND c.collprovider = 'i' AND c.collisdeterministic
              AND c.collencoding IN (-1, d.encoding)
              AND pg_catalog.to_regcollation('pg_catalog."und-x-icu"') = c.oid
        )
    '''))
    if not available:
        raise InboxSearchUnavailable()


async def inbox_page(session, center, *, view, channel, conv_type, user_id, q, limit, offset):
    now = datetime.now(timezone.utc)
    views = view_predicates(center, user_id, now)
    # Match format_vehicle_label's strip and punctuation, including legacy
    # Unicode whitespace. Keep an absent vehicle absent rather than searchable.
    whitespace = '\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000'
    vehicle_name = func.btrim(func.concat(func.coalesce(Brand.name, ''), ' ',
                                        func.coalesce(VehicleModel.name, '')), whitespace)
    vehicle_label = case((Vehicle.id.is_(None), None),
        (or_(Vehicle.license_plate.is_(None), Vehicle.license_plate == ''), vehicle_name),
        else_=func.concat(vehicle_name, ' (', Vehicle.license_plate, ')'))
    columns = ('id', 'subject', 'conv_type', 'status', 'priority', 'last_channel', 'last_message_at',
        'last_activity_at', 'last_message_preview', 'last_sender_role', 'unread_messages', 'unread_activity',
        'ai_summary', 'assigned_user_id', 'customer_id', 'vehicle_id', 'appointment_id', 'case_id', 'invoice_id', 'created_at')
    statement = select(*(getattr(Conversation, name) for name in columns),
        Customer.full_name.label('customer_name'), Customer.phone.label('customer_phone'),
        User.full_name.label('assigned_name'), Brand.name.label('brand'), VehicleModel.name.label('model'),
        Vehicle.license_plate.label('plate'), OperationalCase.code.label('case_code'),
        OperationalCase.status.label('case_status'), OperationalCase.created_at.label('case_created_at'),
        OperationalCase.is_active.label('case_is_active'),
        OperationalCase.sla_response_minutes,
    ).select_from(Conversation).outerjoin(Customer, and_(
        Customer.id == Conversation.customer_id, Customer.service_center_id == center,
    )).outerjoin(Vehicle, and_(Vehicle.id == Conversation.vehicle_id, Vehicle.service_center_id == center)
    ).outerjoin(VehicleModel, VehicleModel.id == Vehicle.vehicle_model_id
    ).outerjoin(Brand, Brand.id == VehicleModel.brand_id
    ).outerjoin(User, and_(User.id == Conversation.assigned_user_id, User.service_center_id == center)
    ).outerjoin(OperationalCase, and_(OperationalCase.id == Conversation.case_id,
        OperationalCase.service_center_id == center)).where(*safe_conversation(center))
    if channel and channel != 'all':
        statement = statement.where(Conversation.last_channel == channel)
    if conv_type and conv_type != 'all':
        statement = statement.where(Conversation.conv_type == conv_type)
    query = (q or '').strip()
    if query:
        await require_search_collation(session)
        pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        # Keep the bound pattern uncollated: asyncpg renders inferred collation
        # into a VARCHAR bind cast for expressions such as a UUID cast. The
        # schema-qualified collation belongs on the owning projection only.
        bound_pattern = bindparam('inbox_search_pattern', pattern, type_=String())
        collation = quoted_name('pg_catalog."und-x-icu"', quote=False)
        statement = statement.where(or_(*(field.collate(collation).ilike(bound_pattern, escape='\\') for field in (
            Conversation.subject, Customer.full_name, Vehicle.license_plate, Vehicle.vin,
            Brand.name, VehicleModel.name, OperationalCase.code, OperationalCase.title,
            vehicle_label,
            cast(Conversation.id, String), cast(Customer.id, String),
            cast(Vehicle.id, String), cast(OperationalCase.id, String),
        ))))
    # One aggregate query: selected view never narrows the other rail counts.
    counts = (await session.execute(statement.with_only_columns(
        *(func.count().filter(predicate).label(name) for name, predicate in views.items()),
        maintain_column_froms=True,
    ))).mappings().one()
    priority = case((Conversation.priority == 'high', 0), (Conversation.priority == 'low', 2), else_=1)
    page = statement.where(views[view]).order_by(priority, Conversation.last_activity_at.desc().nullslast(),
        Conversation.id.desc()).limit(limit).offset(offset)
    items = []
    for record in (await session.execute(page)).mappings():
        item = {name: record[name] for name in columns}
        for name, value in item.items():
            if isinstance(value, uuid.UUID):
                item[name] = str(value)
            elif isinstance(value, datetime):
                item[name] = value.isoformat()
        item.update(customer_name=record['customer_name'], customer_phone=record['customer_phone'],
            assigned_name=record['assigned_name'], is_open=record['status'] in OPEN_STATUSES)
        if record['vehicle_id']:
            item['vehicle_label'] = format_vehicle_label(record['brand'], record['model'], record['plate'])
        if record['case_id']:
            elapsed = int((now - record['case_created_at']).total_seconds())
            tracking = sla_tracking_active(record['status'], record['case_status'], record['case_is_active'])
            item.update(case_code=record['case_code'], case_status=record['case_status'],
                sla_tracking_active=tracking,
                sla_elapsed_seconds=elapsed, sla_response_minutes=record['sla_response_minutes'],
                sla_breached=tracking and elapsed > record['sla_response_minutes'] * 60)
        items.append(item)
    return dict(items=items, counts=dict(counts), total=counts[view], view=view, limit=limit, offset=offset)
