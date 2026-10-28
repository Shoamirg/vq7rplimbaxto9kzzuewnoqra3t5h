"""Register the app's Expo push token so the garage's updates reach the phone."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.models.push_device import PushDevice
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.auth import LogoutResponse

router = APIRouter()

_EXPO_TOKEN = r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,200}\]$"


class DeviceIn(BaseModel):
    token: str = Field(pattern=_EXPO_TOKEN)
    platform: Literal["ios", "android"]


class DeviceOut(BaseModel):
    token: str = Field(pattern=_EXPO_TOKEN)


@router.post("", response_model=LogoutResponse, summary="Register this device for push notifications")
async def register(body: DeviceIn, customer: Customer = Depends(get_current_customer),
                   uow: UnitOfWork = Depends(get_customer_uow)) -> LogoutResponse:
    row = await uow.session.scalar(select(PushDevice).where(PushDevice.token == body.token).with_for_update())
    if row is None:
        uow.session.add(PushDevice(token=body.token, platform=body.platform, customer_id=customer.id,
                                   service_center_id=customer.service_center_id))
    else:
        # The same phone signed into another account now notifies that account only.
        row.customer_id, row.service_center_id = customer.id, customer.service_center_id
        row.platform, row.last_seen_at = body.platform, datetime.now(timezone.utc)
    return LogoutResponse()


@router.delete("", response_model=LogoutResponse, summary="Stop push notifications on this device (call on sign-out)")
async def unregister(body: DeviceOut, customer: Customer = Depends(get_current_customer),
                     uow: UnitOfWork = Depends(get_customer_uow)) -> LogoutResponse:
    await uow.session.execute(delete(PushDevice).where(PushDevice.token == body.token,
                                                       PushDevice.customer_id == customer.id))
    return LogoutResponse()
