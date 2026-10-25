"""Customer messages — the same UCP Conversation, minus staff-internal notes."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import (
    MessagesResponse,
    PostMessageRequest,
    ThreadMessage,
    ThreadResponse,
)
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get("", response_model=MessagesResponse, summary="Conversations + activity feed")
async def list_messages(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> MessagesResponse:
    return await CustomerPortalService(uow, customer).messages()


@router.get("/{conversation_id}", response_model=ThreadResponse, summary="A conversation thread")
async def thread(
    conversation_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> ThreadResponse:
    return await CustomerPortalService(uow, customer).thread(conversation_id)


@router.post("/{conversation_id}", response_model=ThreadMessage, summary="Reply to a conversation")
async def post_message(
    conversation_id: uuid.UUID,
    body: PostMessageRequest,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow, scope="function"),
    idempotency_key: uuid.UUID | None = Header(default=None),
) -> ThreadMessage:
    return await CustomerPortalService(uow, customer).post_message(
        conversation_id, body.body, attachments=body.attachments, idempotency_key=idempotency_key)
