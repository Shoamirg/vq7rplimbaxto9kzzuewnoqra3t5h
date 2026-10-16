"""Paginated, customer-safe history projections."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.core.timezone import local_date_for_instant, service_center_timezone
from app.exceptions import NotFoundError
from app.models import Appointment, Invoice, Vehicle


router = APIRouter()
VISIBLE_INVOICE_STATUSES = {"issued", "partial", "paid", "overdue", "void", "refunded"}
PAGE_SIZE = 30


def _customer_scope(model, customer):
    return (
        model.customer_id == customer.id,
        model.service_center_id == customer.service_center_id,
        model.is_active.is_(True),
    )


def _appointment_history_item(appointment, timezone_name: str) -> dict:
    local_date = local_date_for_instant(appointment.appointment_date, timezone_name).isoformat()
    return {
        "id": str(appointment.id),
        "title": f"{local_date} {appointment.appointment_time}",
        "detail": appointment.status,
        "appointment_local_date": local_date,
    }


@router.get("/{kind}")
async def history(
    kind: Literal["vehicles", "appointments", "invoices"],
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1, le=2_147_483_647),
    customer=Depends(get_current_customer),
    uow=Depends(get_customer_uow),
):
    model = {"vehicles": Vehicle, "appointments": Appointment, "invoices": Invoice}[kind]
    conditions = list(_customer_scope(model, customer))

    if model is Invoice:
        conditions.extend((Invoice.kind == "invoice", Invoice.status.in_(VISIBLE_INVOICE_STATUSES)))

    if q:
        pattern = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        column = {
            "vehicles": Vehicle.license_plate,
            "appointments": Appointment.status,
            "invoices": Invoice.code,
        }[kind]
        conditions.append(column.ilike(f"%{pattern}%", escape="\\"))

    total = await uow.session.scalar(select(func.count()).select_from(model).where(*conditions))
    statement = (
        select(model)
        .where(*conditions)
        .order_by(model.created_at.desc(), model.id)
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    )
    if model is Vehicle:
        statement = statement.options(selectinload(Vehicle.vehicle_model))

    rows = (await uow.session.scalars(statement)).all()
    timezone_name = (
        await service_center_timezone(uow.session, customer.service_center_id)
        if kind == "appointments"
        else None
    )
    items = []
    for row in rows:
        if kind == "vehicles":
            item = {
                "id": str(row.id),
                "title": row.vehicle_model.name,
                "detail": f"{row.license_plate or '—'} · {row.year}",
            }
        elif kind == "appointments":
            item = _appointment_history_item(row, timezone_name)
        else:
            item = {
                "id": str(row.id),
                "title": row.code,
                "detail": row.status,
                "currency": row.currency,
                "total": row.total,
                "balance": row.balance,
            }
        items.append(item)

    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}


@router.get("/invoices/{invoice_id}")
async def invoice_detail(
    invoice_id: uuid.UUID,
    customer=Depends(get_current_customer),
    uow=Depends(get_customer_uow),
):
    invoice = await uow.session.scalar(
        select(Invoice)
        .where(
            *_customer_scope(Invoice, customer),
            Invoice.id == invoice_id,
            Invoice.kind == "invoice",
            Invoice.status.in_(VISIBLE_INVOICE_STATUSES),
        )
        .options(selectinload(Invoice.line_items), selectinload(Invoice.payments))
    )
    if invoice is None:
        raise NotFoundError("Invoice not found")

    return {
        "code": invoice.code,
        "currency": invoice.currency,
        "total": invoice.total,
        "balance": invoice.balance,
        "lines": [
            {"description": line.description, "quantity": line.quantity, "total": line.line_total}
            for line in sorted(invoice.line_items, key=lambda row: (row.sort_order, str(row.id)))
            if line.is_active and line.service_center_id == customer.service_center_id
        ],
        "payments": [
            {
                "amount": payment.amount,
                "kind": payment.kind,
                "method": payment.method,
                "date": payment.received_at.isoformat(),
            }
            for payment in sorted(invoice.payments, key=lambda row: (row.received_at, str(row.id)))
            if payment.is_active and payment.service_center_id == customer.service_center_id
        ],
    }
