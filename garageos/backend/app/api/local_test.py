"""Explicit local-only SMS inbox for synthetic emulator integration tests.

Not mounted by normal apps, absent from deployed OpenAPI, and rejected by the
production settings validator. The Compose port is bound to host loopback.
"""
import re
from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings
from app.core.phone import normalize_phone
from app.services.sms import ConsoleSmsSender

router = APIRouter()


@router.get('/sms')
async def sms(phone: str = Query(min_length=7, max_length=30)):
    if not settings.LOCAL_TEST_MODE or settings.ENVIRONMENT != 'development' or settings.SMS_PROVIDER != 'console':
        raise HTTPException(404)
    target = normalize_phone(phone)
    for recipient, message in reversed(ConsoleSmsSender.sent):
        if normalize_phone(recipient) == target:
            code = re.search(r'(?<!\d)(\d{6})(?!\d)', message)
            if code:
                return {'code': code.group(1)}
    raise HTTPException(404, 'No synthetic SMS was delivered')
