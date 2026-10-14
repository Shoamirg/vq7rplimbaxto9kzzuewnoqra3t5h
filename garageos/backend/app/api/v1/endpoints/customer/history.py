"""Paginated, explicitly customer-safe history. Staff notes are never projected."""
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models import Vehicle, Appointment, Invoice, VehicleModel
from app.exceptions import NotFoundError

router = APIRouter()
VISIBLE = {'issued','partial','paid','overdue','void','refunded'}

def scope(model, customer):
    return [model.customer_id == customer.id,model.service_center_id == customer.service_center_id,model.is_active.is_(True)]

@router.get('/{kind}')
async def history(kind: Literal['vehicles','appointments','invoices'],
                  q: str=Query('',max_length=100), page:int=Query(1,ge=1,le=2147483647),
                  customer=Depends(get_current_customer),uow=Depends(get_customer_uow)):
    model={'vehicles':Vehicle,'appointments':Appointment,'invoices':Invoice}[kind]
    conditions=scope(model,customer)
    if model is Invoice: conditions += [Invoice.kind=='invoice',Invoice.status.in_(VISIBLE)]
    if q:
        pattern='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        column={'vehicles':Vehicle.license_plate,'appointments':Appointment.status,'invoices':Invoice.code}[kind]
        conditions.append(column.ilike(pattern,escape='\\'))
    count=await uow.session.scalar(select(func.count()).select_from(model).where(*conditions))
    statement=select(model).where(*conditions).order_by(model.created_at.desc(),model.id).offset((page-1)*30).limit(30)
    if model is Vehicle: statement=statement.options(selectinload(Vehicle.vehicle_model))
    rows=(await uow.session.scalars(statement)).all()
    items=[]
    for row in rows:
        if kind=='vehicles': item={'id':str(row.id),'title':row.vehicle_model.name,'detail':f'{row.license_plate or chr(8212)} · {row.year}'}
        elif kind=='appointments':item={'id':str(row.id),'title':f'{row.appointment_date.date()} {row.appointment_time}','detail':row.status}
        else:item={'id':str(row.id),'title':row.code,'detail':row.status,'currency':row.currency,'total':row.total,'balance':row.balance}
        items.append(item)
    return {'items':items,'total':count,'page':page,'page_size':30}

@router.get('/invoices/{invoice_id}')
async def invoice_detail(invoice_id:uuid.UUID,customer=Depends(get_current_customer),uow=Depends(get_customer_uow)):
    invoice=await uow.session.scalar(select(Invoice).where(*scope(Invoice,customer),Invoice.id==invoice_id,
        Invoice.kind=='invoice',Invoice.status.in_(VISIBLE)).options(selectinload(Invoice.line_items),selectinload(Invoice.payments)))
    if invoice is None:raise NotFoundError('Invoice not found')
    return {'code':invoice.code,'currency':invoice.currency,'total':invoice.total,'balance':invoice.balance,
        'lines':[{'description':line.description,'quantity':line.quantity,'total':line.line_total}
            for line in sorted(invoice.line_items,key=lambda r:(r.sort_order,str(r.id))) if line.is_active and line.service_center_id==customer.service_center_id],
        'payments':[{'amount':payment.amount,'kind':payment.kind,'method':payment.method,'date':payment.received_at.isoformat()}
            for payment in sorted(invoice.payments,key=lambda r:(r.received_at,str(r.id))) if payment.is_active and payment.service_center_id==customer.service_center_id]}
