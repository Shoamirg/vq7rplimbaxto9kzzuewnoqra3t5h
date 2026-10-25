"""Photo uploads stored on the server's own disk (UPLOAD_DIR).

* Only images are accepted, recognised by their bytes, never by the client's
  filename or Content-Type: JPEG, PNG, WebP, HEIC/HEIF (iPhone camera default).
* Size is capped while streaming, so an oversized upload is cut off early.
* Files land at ``UPLOAD_DIR/<tenant>/<file id>``; nothing client-supplied is
  ever part of the path. Downloads are served by the API after an access check,
  never as a public static directory.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.exceptions import GarageException, NotFoundError, ValidationError
from app.models.stored_file import StoredFile

_CHUNK = 1024 * 1024


class FileTooLarge(GarageException):
    status_code = 413
    code = "FILE_TOO_LARGE"

    def __init__(self):
        self.detail = f"File exceeds {settings.UPLOAD_MAX_BYTES // (1024 * 1024)} MB"


class UnsupportedFileType(ValidationError):
    code = "UNSUPPORTED_FILE_TYPE"
    detail = "Only JPEG, PNG, WebP or HEIC photos can be uploaded"


def sniff_image(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
        return "image/heic"
    return None


def _root() -> Path:
    return Path(settings.UPLOAD_DIR).resolve()


def file_path(row: StoredFile) -> Path:
    return _root() / str(row.service_center_id) / str(row.id)


async def save_upload(upload: UploadFile, *, service_center_id: uuid.UUID,
                      customer_id: uuid.UUID | None = None,
                      user_id: uuid.UUID | None = None) -> StoredFile:
    """Write the upload to disk and return the (unsaved) row describing it."""
    row = StoredFile(id=uuid.uuid4(), service_center_id=service_center_id,
                     customer_id=customer_id, uploaded_by_user_id=user_id,
                     content_type="", size_bytes=0, sha256="")
    target = file_path(row)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    digest, size = hashlib.sha256(), 0
    try:
        with open(partial, "wb") as out:
            first = True
            while chunk := await upload.read(_CHUNK):
                if first:
                    content_type = sniff_image(chunk[:16])
                    if content_type is None:
                        raise UnsupportedFileType()
                    row.content_type, first = content_type, False
                size += len(chunk)
                if size > settings.UPLOAD_MAX_BYTES:
                    raise FileTooLarge()
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise UnsupportedFileType()
        os.replace(partial, target)
    finally:
        if partial.exists():
            partial.unlink()
    row.size_bytes, row.sha256 = size, digest.hexdigest()
    return row


def existing_path(row: StoredFile) -> Path:
    path = file_path(row)
    if not path.is_file():
        raise NotFoundError("File not found")
    return path


def remove_file(row: StoredFile) -> None:
    file_path(row).unlink(missing_ok=True)


def staff_url(file_id: uuid.UUID | str) -> str:
    return f"/api/v1/files/{file_id}"


def customer_url(file_id: uuid.UUID | str) -> str:
    return f"/api/v1/customer/files/{file_id}"


def customer_view_url(url: str | None) -> str | None:
    """Attachment URLs are stored in the staff form; customers get their own route."""
    prefix = "/api/v1/files/"
    if url and url.startswith(prefix):
        return customer_url(url[len(prefix):])
    return url
