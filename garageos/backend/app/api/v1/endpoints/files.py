"""Staff photo uploads and downloads, scoped to the staff member's garage."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import get_current_user, get_tenant_uow
from app.api.v1.endpoints.customer.files import UploadedFile
from app.core.rate_limit import write_rate_limit
from app.exceptions import NotFoundError
from app.models.stored_file import StoredFile
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services import file_storage

router = APIRouter()


@router.post("", status_code=201, response_model=UploadedFile, dependencies=[Depends(write_rate_limit)],
             summary="Upload a photo; attach it to a message with its url")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user),
                 uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> UploadedFile:
    row = await file_storage.save_upload(file, service_center_id=user.service_center_id, user_id=user.id)
    uow.session.add(row)
    try:
        await uow.commit()
    except Exception:
        file_storage.remove_file(row)
        raise
    return UploadedFile(id=str(row.id), content_type=row.content_type, size_bytes=row.size_bytes,
                        url=file_storage.staff_url(row.id))


@router.get("/{file_id}", summary="Download a photo from this garage")
async def download(file_id: uuid.UUID, user: User = Depends(get_current_user),
                   uow: UnitOfWork = Depends(get_tenant_uow)) -> FileResponse:
    row = await uow.session.scalar(select(StoredFile).where(
        StoredFile.id == file_id, StoredFile.service_center_id == user.service_center_id))
    if row is None:
        raise NotFoundError("File not found")
    return FileResponse(file_storage.existing_path(row), media_type=row.content_type,
                        headers={"Cache-Control": "private, max-age=86400",
                                 "X-Content-Type-Options": "nosniff"})
