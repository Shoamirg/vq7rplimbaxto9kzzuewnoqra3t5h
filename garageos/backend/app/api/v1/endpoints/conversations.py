"""Unified Communications Platform — Inbox & conversation endpoints (M3)."""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.api.deps import get_current_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.conversation_service import ConversationService
from app.services.message_intent import MessageSubmission

router = APIRouter()


class ParticipantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal['customer', 'dispatcher', 'mechanic', 'manager', 'watcher', 'system'] = "customer"
    display_name: str = Field(max_length=120)
    user_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None

    @field_validator('display_name')
    @classmethod
    def meaningful_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('Display name must contain text')
        return value

    @model_validator(mode='after')
    def identity_namespace(self) -> ParticipantIn:
        if self.role == 'customer' and self.user_id is not None:
            raise ValueError('Customer participants use customer_id')
        if self.role != 'customer' and self.customer_id is not None:
            raise ValueError('Staff participants use user_id')
        return self


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str | None = Field(default=None, max_length=200)
    conv_type: Literal['general', 'emergency', 'support', 'warranty', 'vip'] = "general"
    priority: Literal['high', 'medium', 'low'] = "medium"
    customer_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    assigned_user_id: uuid.UUID | None = None
    ai_summary: str | None = Field(default=None, max_length=200)
    pinned_notes: list[str] | None = None
    participants: list[ParticipantIn] | None = None

    @field_validator('subject')
    @classmethod
    def meaningful_subject(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError('Subject must contain text or be omitted')
        return value


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
    model_config = ConfigDict(extra="forbid")

    status: Literal['open', 'waiting_customer', 'waiting_technician', 'waiting_approval', 'snoozed', 'resolved'] | None = None
    assigned_user_id: uuid.UUID | None = None
    mark_read: bool | None = None
    read_observation: uuid.UUID | None = None

    @field_validator('status')
    @classmethod
    def explicit_status(cls, value: str | None) -> str:
        if value is None:
            raise ValueError('An explicit status cannot be null')
        return value


@router.get("", summary="Inbox — a work-queue view of conversations")
async def list_inbox(
    uow: UnitOfWork = Depends(get_tenant_uow),
    me: User = Depends(get_current_user),
    view: Literal['all', 'needs_reply', 'assigned_me', 'mentions', 'waiting_customer',
                  'waiting_technician', 'waiting_approval', 'sla_breached', 'unread',
                  'resolved', 'snoozed'] = Query(default="needs_reply"),
    channel: Literal['all', 'app', 'telegram', 'web', 'phone', 'email', 'sms', 'internal'] | None = Query(default=None),
    conv_type: Literal['all', 'general', 'emergency', 'support', 'warranty', 'vip'] | None = Query(default=None, alias="type"),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=80, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=2147483647),
) -> dict:
    return await ConversationService(uow).list_inbox(
        view=view, channel=channel, conv_type=conv_type, user_id=me.id,
        q=q, limit=limit, offset=offset)


@router.get("/choices", summary="Eligible paged references for Inbox creation and assignment")
async def conversation_choices(
    kind: Literal['customer', 'vehicle', 'appointment', 'case', 'invoice', 'assignee'] = Query(),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=2147483647),
    customer_id: uuid.UUID | None = Query(default=None),
    vehicle_id: uuid.UUID | None = Query(default=None),
    appointment_id: uuid.UUID | None = Query(default=None),
    case_id: uuid.UUID | None = Query(default=None),
    invoice_id: uuid.UUID | None = Query(default=None),
    assigned_user_id: uuid.UUID | None = Query(default=None),
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await ConversationService(uow).list_choices(kind=kind, q=q, limit=limit,
        offset=offset, customer_id=customer_id, vehicle_id=vehicle_id,
        appointment_id=appointment_id, case_id=case_id, invoice_id=invoice_id,
        assigned_user_id=assigned_user_id)


@router.get("/{conversation_id}", summary="Full thread (messages, activity, linked cards)")
async def get_thread(
    conversation_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    me: User = Depends(get_current_user),
) -> dict:
    return await ConversationService(uow).get_thread(conversation_id, user_id=me.id, observe_read=True)


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
    idempotency_key: uuid.UUID | None = Header(default=None),
) -> dict:
    payload = body.model_dump()
    atts = payload.pop("attachments", None)
    # Staff replies default to the signed-in user as author.
    if payload.get("author_role") in ("dispatcher", "manager") and not payload.get("author_name"):
        payload["author_name"] = me.full_name
    return await ConversationService(uow).post_message(
        conversation_id, attachments=atts, author_user_id=me.id,
        submission=MessageSubmission(idempotency_key, "staff", me.id, body.author_name) if idempotency_key is not None else None,
        **payload)


@router.patch("/{conversation_id}", summary="Update a conversation (status / assign / read)")
async def update_conversation(
    conversation_id: uuid.UUID, body: ConversationUpdate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"), me: User = Depends(get_current_user),
) -> dict:
    svc = ConversationService(uow)
    return await svc.update_conversation(conversation_id, status=body.status,
        assigned_user_id=body.assigned_user_id,
        assignment_supplied='assigned_user_id' in body.model_fields_set,
        mark_read=bool(body.mark_read), read_observation=body.read_observation, actor_id=me.id)


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
