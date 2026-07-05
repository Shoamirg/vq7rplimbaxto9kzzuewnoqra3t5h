"""Commercial Operations — billing endpoints (estimates, invoices, payments)."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService

router = APIRouter()


class LineItemIn(BaseModel):
    kind: str = "part"          # part | labor | fee | discount
    description: str
    quantity: float = 1
    unit_price: float = 0
    line_total: float | None = None
    taxable: bool = True


class InvoiceCreate(BaseModel):
    kind: str = "invoice"       # estimate | invoice
    customer_id: uuid.UUID
    vehicle_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    tax_rate: float | None = None
    due_date: date | None = None
    notes: str | None = None
    line_items: list[LineItemIn] | None = None


class PaymentIn(BaseModel):
    amount: float
    method: str = "card"        # cash | card | bank_transfer | online
    kind: str = "payment"       # payment | refund | deposit
    source: str = "manual"      # manual | terminal | telegram | stripe | bank | cash
    reference: str | None = None
    note: str | None = None


class InvoiceUpdate(BaseModel):
    status: str | None = None   # approved | rejected | changes_requested | void | overdue …


class InvoiceEdit(BaseModel):
    vehicle_id: uuid.UUID | None = None
    tax_rate: float | None = None
    due_date: date | None = None
    notes: str | None = None
    line_items: list[LineItemIn] | None = None


@router.get("", summary="List billing documents by workspace view")
async def list_documents(
    uow: UnitOfWork = Depends(get_tenant_uow),
    view: str = Query(default="invoices"),
) -> dict:
    return await InvoiceService(uow).list_documents(view=view)


@router.get("/{invoice_id}", summary="Full document (line items, payments, timeline)")
async def get_document(invoice_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await InvoiceService(uow).get_document(invoice_id)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create an estimate or invoice")
async def create_document(body: InvoiceCreate, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    payload = body.model_dump()
    payload["line_items"] = [li for li in (payload.get("line_items") or [])]
    return await InvoiceService(uow).create(**payload)


@router.delete("/{invoice_id}", summary="Delete (archive) an estimate or unpaid invoice")
async def delete_document(invoice_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    await InvoiceService(uow).delete(invoice_id)
    return {"ok": True}


@router.put("/{invoice_id}", summary="Edit an estimate or unpaid invoice (line items, notes, …)")
async def edit_document(invoice_id: uuid.UUID, body: InvoiceEdit, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    payload = body.model_dump()
    if payload.get("line_items") is not None:
        payload["line_items"] = [li for li in payload["line_items"]]
    return await InvoiceService(uow).update(invoice_id, **payload)


@router.post("/{invoice_id}/payments", status_code=status.HTTP_201_CREATED, summary="Record a payment / refund")
async def record_payment(invoice_id: uuid.UUID, body: PaymentIn, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await InvoiceService(uow).record_payment(invoice_id, **body.model_dump())


@router.post("/{invoice_id}/send", summary="Send an estimate/invoice to the customer")
async def send_document(invoice_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await InvoiceService(uow).send(invoice_id)


@router.post("/{invoice_id}/convert", status_code=status.HTTP_201_CREATED, summary="Convert an approved estimate into an invoice")
async def convert_document(invoice_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await InvoiceService(uow).convert_to_invoice(invoice_id)


@router.patch("/{invoice_id}", summary="Update a document status (approve / reject / …)")
async def update_document(invoice_id: uuid.UUID, body: InvoiceUpdate, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    svc = InvoiceService(uow)
    if body.status is not None:
        return await svc.set_status(invoice_id, body.status)
    return await svc.get_document(invoice_id)
