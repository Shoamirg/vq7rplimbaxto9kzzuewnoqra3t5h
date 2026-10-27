"""Customer photo uploads (for messages and roadside help) and downloads."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import exists, or_, select

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.core.rate_limit import write_rate_limit
from app.exceptions import NotFoundError
from app.models.conversation import Attachment, Conversation, Message
from app.models.customer import Customer
from app.models.stored_file import StoredFile
from app.repositories.unit_of_work import UnitOfWork
from app.services import file_storage

router = APIRouter()


class UploadedFile(BaseModel):
    id: str
    content_type: str
    size_bytes: int
    url: str


@router.post("", status_code=201, response_model=UploadedFile, dependencies=[Depends(write_rate_limit)],
             summary="Upload a photo (JPEG, PNG, WebP, HEIC)")
async def upload(file: UploadFile = File(...),
                 customer: Customer = Depends(get_current_customer),
                 uow: UnitOfWork = Depends(get_customer_uow, scope="function")) -> UploadedFile:
    row = await file_storage.save_upload(file, service_center_id=customer.service_center_id,
                                         customer_id=customer.id)
    uow.session.add(row)
    try:
        await uow.commit()
    except Exception:
        file_storage.remove_file(row)
        raise
    return UploadedFile(id=str(row.id), content_type=row.content_type, size_bytes=row.size_bytes,
                        url=file_storage.customer_url(row.id))


@router.get("/{file_id}", summary="Download a photo you uploaded or one sent to you")
async def download(file_id: uuid.UUID,
                   customer: Customer = Depends(get_current_customer),
                   uow: UnitOfWork = Depends(get_customer_uow)) -> FileResponse:
    shared_with_me = exists().where(
        Attachment.url == file_storage.staff_url(file_id),
        Attachment.service_center_id == customer.service_center_id,
        Message.id == Attachment.message_id, Message.is_internal.is_(False),
        Conversation.id == Attachment.conversation_id, Conversation.customer_id == customer.id,
    )
    row = await uow.session.scalar(select(StoredFile).where(
        StoredFile.id == file_id, StoredFile.service_center_id == customer.service_center_id,
        or_(StoredFile.customer_id == customer.id, shared_with_me)))
    if row is None:
        raise NotFoundError("File not found")
    return FileResponse(file_storage.existing_path(row), media_type=row.content_type,
                        headers={"Cache-Control": "private, max-age=86400",
                                 "X-Content-Type-Options": "nosniff"})
