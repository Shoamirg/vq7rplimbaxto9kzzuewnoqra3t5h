"""Notification engine — the read/write side of the one event stream.

Business modules never call this to "send" a notification; the event handlers
map domain events to notifications (see notification_handlers). This service
persists them and serves the bell feed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update

from app.models.notification import Notification
from app.repositories.unit_of_work import UnitOfWork

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "category": n.category,
        "severity": n.severity,
        "title": n.title,
        "body": n.body,
        "entity_type": n.entity_type,
        "entity_id": str(n.entity_id) if n.entity_id else None,
        "link": n.link,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


class NotificationService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id

    async def create(
        self,
        *,
        category: str,
        title: str,
        severity: str = "info",
        body: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        link: str | None = None,
    ) -> Notification:
        n = Notification(
            service_center_id=self.sc,
            category=category,
            severity=severity,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
            link=link,
        )
        self.session.add(n)
        await self.session.flush()
        return n

    async def list(self, *, category: str | None = None, limit: int = 30) -> dict:
        stmt = select(Notification).where(
            Notification.service_center_id == self.sc, Notification.is_active.is_(True)
        )
        if category and category != "all":
            stmt = stmt.where(Notification.category == category)
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        rows = (await self.session.execute(stmt)).scalars().all()

        unread = await self.session.execute(
            select(func.count()).select_from(Notification).where(
                Notification.service_center_id == self.sc,
                Notification.is_active.is_(True),
                Notification.is_read.is_(False),
            )
        )
        return {"items": [_serialize(n) for n in rows], "unread_count": int(unread.scalar_one())}

    async def mark_read(self, notification_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.service_center_id == self.sc)
            .values(is_read=True)
        )

    async def mark_all_read(self) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.service_center_id == self.sc, Notification.is_read.is_(False))
            .values(is_read=True)
        )
