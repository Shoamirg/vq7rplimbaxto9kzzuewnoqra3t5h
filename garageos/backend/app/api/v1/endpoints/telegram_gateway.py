"""Telegram → Inbox gateway.

Two jobs the Mini App can't do:

1. ``POST /telegram/ingest`` — when a customer sends a plain chat message (text,
   photo, voice, document, location) *to the bot*, the bot forwards it here.
   Authenticated by a shared secret (bot ↔ backend trust, not a user token). We
   resolve the Telegram user to a linked customer, find or open their inbox
   thread, and append the message so it lands in staff's Inbox like any other.

2. ``GET /telegram/media/{file_id}`` — staff-only. Telegram file bytes live
   behind the bot token; this streams them so a photo/voice attachment renders
   in the dashboard without ever exposing the token to the browser.
"""
from __future__ import annotations

import mimetypes
import secrets
from sqlalchemy import select

import httpx
from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_uow
from app.core.config import settings
from app.core.database import get_db
from app.exceptions import ForbiddenError, NotFoundError
from app.models.conversation import Attachment, Conversation, Channel, MessageKind, ParticipantRole
from app.repositories.inbox_query import safe_conversation
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.conversation_service import ConversationService

router = APIRouter()

_TG_API = "https://api.telegram.org"


class AttachmentIn(BaseModel):
    kind: str = Field(description="photo | voice | document | location")
    file_id: str | None = None
    label: str | None = None
    mime: str | None = None
    duration: int | None = None
    file_name: str | None = None
    lat: float | None = None
    lng: float | None = None


class IngestRequest(BaseModel):
    telegram_id: int
    text: str | None = None
    attachments: list[AttachmentIn] = Field(default_factory=list)


def _require_bot_secret(x_bot_secret: str | None = Header(default=None)) -> None:
    secret = settings.TELEGRAM_WEBHOOK_SECRET
    if not secret or not x_bot_secret or not secrets.compare_digest(x_bot_secret, secret):
        raise ForbiddenError()


def _to_attachment_dict(a: AttachmentIn) -> dict:
    """Map a bot-reported attachment to the conversation Attachment shape."""
    if a.kind == "location":
        label = a.label or "Location"
        url = (
            f"https://maps.google.com/?q={a.lat},{a.lng}"
            if a.lat is not None and a.lng is not None
            else None
        )
        return {"kind": "location", "label": label, "url": url,
                "meta": {"lat": a.lat, "lng": a.lng}}

    default_label = {"photo": "Photo", "voice": "Voice message",
                     "document": a.file_name or "Document"}.get(a.kind, "Attachment")
    return {
        "kind": a.kind,
        "label": a.label or default_label,
        # A dashboard-loadable route that proxies the token-guarded bytes.
        "url": f"/api/media/telegram/{a.file_id}" if a.file_id else None,
        "meta": {"file_id": a.file_id, "mime": a.mime,
                 "duration": a.duration, "file_name": a.file_name},
    }


@router.post("/ingest", summary="Ingest a customer's Telegram chat message into the inbox")
async def ingest(
    payload: IngestRequest,
    _: None = Depends(_require_bot_secret),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not (payload.text or payload.attachments):
        return {"linked": False, "reason": "empty"}

    # Global identity lookup (crosses tenants — the customer's tenant is the
    # boundary we then operate within).
    customer = await CustomerRepository.find_by_telegram_id(db, payload.telegram_id)
    if customer is None:
        return {"linked": False, "reason": "not_linked"}

    atts = [_to_attachment_dict(a) for a in payload.attachments]
    async with UnitOfWork(service_center_id=customer.service_center_id) as uow:
        svc = ConversationService(uow)
        conv_id = await svc.find_or_create_customer_thread(
            customer_id=customer.id, display_name=customer.full_name
        )
        await svc.post_message(
            conv_id,
            body=payload.text or None,
            channel=Channel.TELEGRAM,
            author_role=ParticipantRole.CUSTOMER,
            author_name=customer.full_name,
            kind=MessageKind.TEXT,
            attachments=atts or None,
            customer_actor_id=customer.id,
        )
    return {"linked": True, "conversation_id": str(conv_id)}


@router.get("/media/{file_id}", summary="Stream a Telegram file (staff only)")
async def media(
    file_id: str,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> Response:
    attachment = await uow.session.scalar(select(Attachment.id).join(
        Conversation, Conversation.id == Attachment.conversation_id,
    ).where(
        Attachment.service_center_id == uow.service_center_id,
        Attachment.meta["file_id"].astext == file_id,
        *safe_conversation(uow.service_center_id),
    ).limit(1))
    if attachment is None:
        raise NotFoundError()
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise NotFoundError()
    async with httpx.AsyncClient(timeout=30) as client:
        meta = await client.get(f"{_TG_API}/bot{token}/getFile",
                                params={"file_id": file_id})
        if meta.status_code != 200 or not meta.json().get("ok"):
            raise NotFoundError()
        file_path = meta.json()["result"]["file_path"]
        blob = await client.get(f"{_TG_API}/file/bot{token}/{file_path}")
        if blob.status_code != 200:
            raise NotFoundError()
    content_type = (
        mimetypes.guess_type(file_path)[0]
        or blob.headers.get("content-type")
        or "application/octet-stream"
    )
    # Private media — cache in the browser only, never in shared proxies.
    return Response(
        content=blob.content,
        media_type=content_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
