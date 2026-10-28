"""Commercial Operations — billing endpoints (estimates, invoices, payments)."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, status
from pydantic import BaseModel, Field, FiniteFloat

from app.api.deps import get_staff_permissions, get_tenant_uow, require_staff_permission
from app.core.idempotency import require_idempotency_key
from app.exceptions import UnauthorizedAction
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService

router = APIRouter()


class LineItemIn(BaseModel):
    model_config = {"str_strip_whitespace": True}
    kind: Literal["part", "labor", "fee", "discount"] = "part"
    description: str = Field(min_length=1, max_length=255)
    quantity: FiniteFloat = Field(default=1, gt=0, le=99999999.99)
    unit_price: FiniteFloat = Field(default=0, ge=0, le=99999999.99)
    line_total: FiniteFloat | None = Field(default=None, ge=0, le=99999999.99)
    taxable: bool = True


class InvoiceCreate(BaseModel):
    draft: bool = False
    kind: Literal["estimate", "invoice"] = "invoice"
    customer_id: uuid.UUID
    vehicle_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    tax_rate: FiniteFloat | None = Field(default=None, ge=0, le=100)
    due_date: date | None = None
    notes: str | None = None
    line_items: list[LineItemIn] | None = None


class PaymentIn(BaseModel):
    amount: FiniteFloat = Field(gt=0, le=99999999.99)
    method: Literal["cash", "card", "bank_transfer", "online"] = "card"
    kind: Literal["payment", "refund", "deposit"] = "payment"
    source: Literal["manual", "terminal", "telegram", "stripe", "bank", "cash"] = "manual"
    reference: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=255)


class InvoiceUpdate(BaseModel):
    status: str | None = None   # approved | rejected | changes_requested | void | overdue …


class InvoiceEdit(BaseModel):
    vehicle_id: uuid.UUID | None = None
    tax_rate: FiniteFloat | None = Field(default=None, ge=0, le=100)
    due_date: date | None = None
    notes: str | None = None
    line_items: list[LineItemIn] | None = None


@router.get("", summary="List billing documents by workspace view")
async def list_documents(
    uow: UnitOfWork = Depends(get_tenant_uow),
    _permission: None = Depends(require_staff_permission("billing.read")),
    view: str = Query(default="invoices"),
    q: str = Query(default="", max_length=100),
    customer_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1, le=2_147_483_647),
    page_size: int = Query(default=80, ge=1, le=100),
) -> dict:
    return await InvoiceService(uow).list_documents(view=view, q=q, customer_id=customer_id, page=page, page_size=page_size)


@router.get("/{invoice_id}", summary="Full document (line items, payments, timeline)")
async def get_document(
    invoice_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
    _permission: None = Depends(require_staff_permission("billing.read")),
) -> dict:
    return await InvoiceService(uow).get_document(invoice_id)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create an estimate or invoice")
async def create_document(
    body: InvoiceCreate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("billing.create")),
) -> dict:
    payload = body.model_dump()
    payload["line_items"] = [li for li in (payload.get("line_items") or [])]
    return await InvoiceService(uow).create(**payload)


@router.delete("/{invoice_id}", summary="Delete (archive) an estimate or unpaid invoice")
async def delete_document(
    invoice_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("financial.invoice.void")),
) -> dict:
    await InvoiceService(uow).delete(invoice_id)
    return {"ok": True}


class SendTelegramRequest(BaseModel):
    link: str


@router.post("/{invoice_id}/send-telegram", summary="Send the document link to the customer via Telegram")
async def send_telegram(
    invoice_id: uuid.UUID,
    body: SendTelegramRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("billing.write")),
) -> dict:
    return await InvoiceService(uow).send_telegram(invoice_id, body.link)


@router.put("/{invoice_id}", summary="Edit an estimate or unpaid invoice (line items, notes, …)")
async def edit_document(
    invoice_id: uuid.UUID,
    body: InvoiceEdit,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("billing.write")),
) -> dict:
    payload = body.model_dump()
    if payload.get("line_items") is not None:
        payload["line_items"] = [li for li in payload["line_items"]]
    return await InvoiceService(uow).update(invoice_id, **payload)


@router.post("/{invoice_id}/payments", status_code=status.HTTP_201_CREATED, summary="Record a payment / refund")
async def record_payment(
    invoice_id: uuid.UUID, body: PaymentIn, uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    idempotency_key: uuid.UUID | None = Header(default=None, alias="Idempotency-Key"),
    permissions: list[str] = Depends(get_staff_permissions),
) -> dict:
    require_idempotency_key(str(idempotency_key) if idempotency_key is not None else None)
    if body.kind == "refund" and "financial.refund" not in permissions:
        raise UnauthorizedAction()
    return await InvoiceService(uow).record_payment(
        invoice_id, **body.model_dump(),
        idempotency_key=str(idempotency_key) if idempotency_key is not None else None,
    )


@router.post("/{invoice_id}/send", summary="Send an estimate/invoice to the customer")
async def send_document(
    invoice_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("billing.write")),
) -> dict:
    return await InvoiceService(uow).send(invoice_id)


@router.post("/{invoice_id}/convert", status_code=status.HTTP_201_CREATED, summary="Convert an approved estimate into an invoice")
async def convert_document(
    invoice_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    _permission: None = Depends(require_staff_permission("billing.write")),
) -> dict:
    return await InvoiceService(uow).convert_to_invoice(invoice_id)


@router.patch("/{invoice_id}", summary="Update a document status (approve / reject / …)")
async def update_document(
    invoice_id: uuid.UUID,
    body: InvoiceUpdate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    permissions: list[str] = Depends(get_staff_permissions),
) -> dict:
    if body.status == "void" and "financial.invoice.void" not in permissions:
        raise UnauthorizedAction()
    if body.status != "void" and "billing.write" not in permissions:
        raise UnauthorizedAction()
    svc = InvoiceService(uow)
    if body.status is not None:
        return await svc.set_status(invoice_id, body.status)
    return await svc.get_document(invoice_id)
