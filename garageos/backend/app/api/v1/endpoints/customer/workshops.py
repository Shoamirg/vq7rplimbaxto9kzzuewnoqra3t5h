"""Workshops the signed-in customer is allowed to see (dealer-network aware)."""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.services.workshop_visibility import visible_workshops

router = APIRouter()


class WorkshopCard(BaseModel):
    id: uuid.UUID
    name: str
    tagline: str | None
    monogram: str | None
    primary_color: str | None
    phone: str | None
    address: str | None
    network: str | None
    is_home: bool


class WorkshopList(BaseModel):
    items: list[WorkshopCard]
    restricted_to_network: bool


@router.get("", response_model=WorkshopList, summary="Workshops this customer may see")
async def list_workshops(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
):
    scope = await visible_workshops(uow.session, customer)
    return WorkshopList(restricted_to_network=scope.network_id is not None, items=[WorkshopCard(
        id=c.id, name=c.brand_name or c.name, tagline=c.tagline, monogram=c.monogram,
        primary_color=c.primary_color, phone=c.phone, address=c.address,
        network=c.network.name if c.network else None, is_home=c.id == customer.service_center_id,
    ) for c in scope.workshops])
