"""Unified Communications Platform — Inbox & conversation endpoints (M3)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.conversation_service import ConversationService

router = APIRouter()


class ParticipantIn(BaseModel):
    role: str = "customer"
    display_name: str
    user_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None


class ConversationCreate(BaseModel):
    subject: str | None = None
    conv_type: str = "general"
    priority: str = "medium"
    customer_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    assigned_user_id: uuid.UUID | None = None
    ai_summary: str | None = None
    pinned_notes: list[str] | None = None
    participants: list[ParticipantIn] | None = None


class AttachmentIn(BaseModel):
    kind: str = "photo"
    label: str
    url: str | None = None
    meta: dict | None = None


class MessageCreate(BaseModel):
    body: str | None = None
    channel: str = "web"
    author_role: str = "dispatcher"
    author_name: str | None = None
    kind: str = "text"
    is_internal: bool = False
    mentions: list[str] | None = None
    attachments: list[AttachmentIn] | None = None


class ConversationUpdate(BaseModel):
    status: str | None = None
    assigned_user_id: uuid.UUID | None = None
    mark_read: bool | None = None


@router.get("", summary="Inbox — a work-queue view of conversations")
async def list_inbox(
    uow: UnitOfWork = Depends(get_tenant_uow),
    me: User = Depends(get_current_user),
    view: str = Query(default="needs_reply"),
    channel: str | None = Query(default=None),
    conv_type: str | None = Query(default=None, alias="type"),
) -> dict:
    return await ConversationService(uow).list_inbox(
        view=view, channel=channel, conv_type=conv_type, user_id=me.id)


@router.get("/{conversation_id}", summary="Full thread (messages, activity, linked cards)")
async def get_thread(
    conversation_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow),
    me: User = Depends(get_current_user),
) -> dict:
    return await ConversationService(uow).get_thread(conversation_id, user_id=me.id)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Start a conversation")
async def create_conversation(body: ConversationCreate, uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> dict:
    payload = body.model_dump()
    if payload.get("participants") is not None:
        payload["participants"] = [p for p in payload["participants"]]
    return await ConversationService(uow).create_conversation(**payload)


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED, summary="Post a message")
async def post_message(
    conversation_id: uuid.UUID, body: MessageCreate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"), me: User = Depends(get_current_user),
) -> dict:
    payload = body.model_dump()
    atts = payload.pop("attachments", None)
    # Staff replies default to the signed-in user as author.
    if payload.get("author_role") in ("dispatcher", "manager") and not payload.get("author_name"):
        payload["author_name"] = me.full_name
    return await ConversationService(uow).post_message(
        conversation_id, attachments=atts, author_user_id=me.id, **payload)


@router.patch("/{conversation_id}", summary="Update a conversation (status / assign / read)")
async def update_conversation(
    conversation_id: uuid.UUID, body: ConversationUpdate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"), me: User = Depends(get_current_user),
) -> dict:
    svc = ConversationService(uow)
    result = None
    if body.assigned_user_id is not None:
        result = await svc.assign(conversation_id, body.assigned_user_id)
    if body.status is not None:
        result = await svc.set_status(conversation_id, body.status)
    if body.mark_read:
        result = await svc.mark_read(conversation_id)
    return result or await svc.get_thread(conversation_id, user_id=me.id)


@router.post("/{conversation_id}/follow", summary="Follow a conversation (get updates unassigned)")
async def follow(
    conversation_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    me: User = Depends(get_current_user),
) -> dict:
    return await ConversationService(uow).follow(conversation_id, user_id=me.id, display_name=me.full_name)


@router.delete("/{conversation_id}/follow", summary="Stop following a conversation")
async def unfollow(
    conversation_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    me: User = Depends(get_current_user),
) -> dict:
    return await ConversationService(uow).unfollow(conversation_id, user_id=me.id)
