"""Notification Center endpoints — the bell feed."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.notification_service import NotificationService

router = APIRouter()


@router.get("", summary="Notification feed + unread count")
async def list_notifications(
    uow: UnitOfWork = Depends(get_tenant_uow),
    category: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
) -> dict:
    return await NotificationService(uow).list(category=category, limit=limit)


@router.post("/{notification_id}/read", summary="Mark a notification read")
async def mark_read(
    notification_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    await NotificationService(uow).mark_read(notification_id)
    return {"ok": True}


@router.post("/read-all", summary="Mark all notifications read")
async def mark_all_read(uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> dict:
    await NotificationService(uow).mark_all_read()
    return {"ok": True}
