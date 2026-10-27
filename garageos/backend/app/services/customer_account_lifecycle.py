"""Self-service lifecycle for mobile customer logins.

Sign-up never creates a customer record: a garage already knows its customers.
The user proves they are the person on a garage record by giving the record's
phone AND email, then typing the SMS code sent to that phone. Only then is a
``CustomerAccount`` opened for the record. Start endpoints answer the same way
whether or not anything matched, so they cannot be used to probe who is a
customer where.

Password reset sends the code to the phone on the account's customer record.
Deleting an account removes the login and every session, and anonymizes the
customer record; invoices, payments and service history stay for the garage.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.phone import normalize_phone, phone_matches, phone_variants
from app.core.rate_limit import enforce_key_limit
from app.core.security import hash_password, verify_password
from app.exceptions import ConflictError, GarageException, InvalidCredentials
from app.models import AuditLog, Customer, ServiceCenter
from app.models.customer_account import CustomerAccount
from app.models.push_device import PushDevice
from app.models.verification_code import VerificationCode
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_session_service import AuthSessionService
from app.services.customer_auth_service import CustomerAuthService
from app.services.sms import OutgoingSms, get_sms_sender

SIGNUP, RESET = "signup", "reset"


class InvalidVerificationCode(GarageException):
    status_code = 400
    code = "INVALID_VERIFICATION_CODE"
    detail = "The code is wrong or has expired. Request a new one."


class CurrentPasswordInvalid(GarageException):
    status_code = 401
    code = 'CURRENT_PASSWORD_INVALID'
    detail = 'The current password is incorrect.'


class SignupProfileNotFound(GarageException):
    status_code = 404
    code = "SIGNUP_PROFILE_NOT_FOUND"
    detail = "No garage customer record matches these details any more."


class AccountAlreadyExists(ConflictError):
    code = "ACCOUNT_ALREADY_EXISTS"
    detail = "An account already exists for these details. Sign in or reset your password."


class GarageSelectionRequired(ConflictError):
    code = "GARAGE_SELECTION_REQUIRED"
    detail = "These details match customer records at several garages. Choose one."

    def __init__(self, garages: list[dict]):
        self.garages = garages


def _code_hash(purpose: str, email: str, phone: str, code: str) -> str:
    message = f"{purpose}:{email}:{phone}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CustomerAccountLifecycle:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session

    # ── shared code machinery ───────────────────────────────────────────────
    async def _send_code(self, purpose: str, email: str, phone: str) -> OutgoingSms:
        code = f"{secrets.randbelow(10**6):06d}"
        # Supersede older open codes so only the newest SMS works.
        await self.session.execute(VerificationCode.__table__.update().where(
            VerificationCode.purpose == purpose, VerificationCode.email == email,
            VerificationCode.consumed_at.is_(None)).values(consumed_at=_now()))
        self.session.add(VerificationCode(
            purpose=purpose, phone=phone, email=email,
            code_hash=_code_hash(purpose, email, phone, code),
            expires_at=_now() + timedelta(seconds=settings.VERIFICATION_CODE_TTL_SECONDS)))
        await self.session.commit()
        # Delivery happens after the response (see deliver_sms): waiting on the
        # SMS gateway only when a record matched would reveal the match.
        return OutgoingSms(phone, settings.SMS_CODE_TEMPLATE.format(code=code))

    async def _throttle(self, purpose: str, email: str, phone: str | None) -> None:
        limit = dict(limit=settings.VERIFICATION_SEND_MAX, window=settings.VERIFICATION_SEND_WINDOW_SECONDS)
        await enforce_key_limit(f"otp:{purpose}:email", email, **limit)
        if phone:
            await enforce_key_limit(f"otp:{purpose}:phone", phone, **limit)

    async def _check_code(self, purpose: str, email: str, code: str) -> VerificationCode:
        row = await self.session.scalar(select(VerificationCode).where(
            VerificationCode.purpose == purpose, VerificationCode.email == email,
            VerificationCode.consumed_at.is_(None),
        ).order_by(VerificationCode.created_at.desc()).limit(1).with_for_update())
        if (row is None or row.expires_at <= _now()
                or row.attempts >= settings.VERIFICATION_CODE_MAX_ATTEMPTS):
            raise InvalidVerificationCode()
        if not hmac.compare_digest(row.code_hash, _code_hash(purpose, email, row.phone, code)):
            row.attempts += 1
            await self.session.commit()  # the failed guess must count even though we raise
            raise InvalidVerificationCode()
        return row

    def _audit(self, customer: Customer, action: str) -> None:
        self.session.add(AuditLog(service_center_id=customer.service_center_id, action=action,
                                  resource_type="customer", resource_id=customer.id,
                                  context={"actor": "customer"}))

    # ── sign-up ─────────────────────────────────────────────────────────────
    def _signup_matches(self, email: str, phone: str):
        return (select(Customer, ServiceCenter.name)
                .join(ServiceCenter, ServiceCenter.id == Customer.service_center_id)
                .where(Customer.is_active.is_(True), ServiceCenter.is_active.is_(True),
                       func.lower(Customer.email) == email,
                       func.regexp_replace(Customer.phone, r"\D", "", "g").in_(phone_variants(phone)),
                       ~exists().where(CustomerAccount.customer_id == Customer.id))
                .order_by(ServiceCenter.name, Customer.id))

    async def start_signup(self, email: str, phone: str) -> OutgoingSms | None:
        get_sms_sender()  # 503 up front when SMS is not configured
        email, phone = email.lower(), normalize_phone(phone)
        await self._throttle(SIGNUP, email, phone)
        taken = await self.session.scalar(select(CustomerAccount.id).where(CustomerAccount.email == email))
        if taken is None and (settings.CUSTOMER_SELF_ENROLLMENT or
                (await self.session.execute(self._signup_matches(email, phone).limit(1))).first()):
            return await self._send_code(SIGNUP, email, phone)
        return None

    async def verify_signup(self, email: str, phone: str, code: str) -> dict:
        email, phone = email.lower(), normalize_phone(phone)
        row = await self._check_code(SIGNUP, email, code)
        if row.phone != phone:
            raise InvalidVerificationCode()
        matches = (await self.session.execute(self._signup_matches(email, phone))).all()
        garages = [{'id': str(c.service_center_id), 'name': name, 'address': ''}
                   for c, name in matches]
        if not garages and settings.CUSTOMER_SELF_ENROLLMENT:
            centers = (await self.session.execute(select(ServiceCenter).where(
                ServiceCenter.is_active.is_(True)).order_by(ServiceCenter.name))).scalars().all()
            garages = [{'id': str(c.id), 'name': c.name, 'address': c.address or ''} for c in centers]
        if not garages:
            raise SignupProfileNotFound()
        return {'garages': garages, 'needs_garage': len(garages) != 1}

    async def complete_signup(self, email: str, phone: str, code: str, password: str,
                              service_center_id: uuid.UUID | None, full_name: str | None = None) -> dict:
        email, phone = email.lower(), normalize_phone(phone)
        row = await self._check_code(SIGNUP, email, code)
        if row.phone != phone:
            raise InvalidVerificationCode()
        statement = self._signup_matches(email, phone)
        if service_center_id is not None:
            statement = statement.where(Customer.service_center_id == service_center_id)
        matches = (await self.session.execute(statement.with_for_update(of=Customer))).all()
        if not matches:
            # A verified phone may enroll only through the explicit opt-in, and
            # cannot select another garage to bypass an existing matching record.
            existing = (await self.session.execute(self._signup_matches(email, phone).limit(1))).first()
            center = await self.session.get(ServiceCenter, service_center_id) if service_center_id else None
            if not settings.CUSTOMER_SELF_ENROLLMENT or existing or not center or not center.is_active:
                raise SignupProfileNotFound()
            if not full_name or not full_name.strip():
                from app.exceptions import ValidationError
                raise ValidationError('Full name is required for a new customer')
            # Preserve existing customers: a phone match with different identity
            # must be reconciled by the garage, never silently claimed.
            duplicate = await self.session.scalar(select(Customer.id).where(
                Customer.service_center_id == service_center_id, Customer.is_active.is_(True),
                phone_matches(Customer.phone, phone)))
            if duplicate:
                raise AccountAlreadyExists()
            customer = Customer(service_center_id=service_center_id, full_name=full_name.strip(),
                                phone=phone, email=email)
            self.session.add(customer)
            await self.session.flush()
            matches = [(customer, center.name)]
        if len(matches) > 1:
            raise GarageSelectionRequired([{"service_center_id": str(c.service_center_id), "name": name}
                                           for c, name in matches])
        customer = matches[0][0]
        account = CustomerAccount(customer_id=customer.id, service_center_id=customer.service_center_id,
                                  email=email, password_hash=hash_password(password))
        self.session.add(account)
        row.consumed_at = _now()
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise AccountAlreadyExists() from None
        self._audit(customer, "customer.account.signup")
        return await CustomerAuthService(self.uow)._tokens(customer, account)  # commits

    # ── password reset / change ─────────────────────────────────────────────
    async def _active_account(self, *, email: str | None = None, phone: str | None = None):
        """The one active account for this email, or for this phone when exactly one exists."""
        statement = (select(CustomerAccount, Customer)
                     .join(Customer, Customer.id == CustomerAccount.customer_id)
                     .where(CustomerAccount.is_active.is_(True), Customer.is_active.is_(True)))
        if email is not None:
            statement = statement.where(CustomerAccount.email == email.lower())
        elif phone:
            statement = statement.where(phone_matches(Customer.phone, phone))
        else:
            return None
        rows = (await self.session.execute(statement.limit(2).with_for_update(of=CustomerAccount))).all()
        # A phone shared by logins at two garages is ambiguous: the user resets by email.
        return rows[0] if len(rows) == 1 else None

    async def start_reset(self, *, email: str | None = None, phone: str | None = None) -> OutgoingSms | None:
        get_sms_sender()
        key = email.lower() if email is not None else normalize_phone(phone)
        await self._throttle(RESET, key, None)
        found = await self._active_account(email=email, phone=phone)
        sms_to = normalize_phone(found[1].phone) if found and found[1].phone else ""
        if sms_to:
            return await self._send_code(RESET, found[0].email, sms_to)
        return None

    async def _set_password(self, account: CustomerAccount, password: str) -> None:
        account.password_hash = hash_password(password)
        account.version += 1  # every token carries the version: all sessions die
        await AuthSessionService(self.session).revoke_principal(
            "customer", account.customer_id, customer_account_id=account.id)

    async def complete_reset(self, code: str, password: str, *, email: str | None = None,
                             phone: str | None = None) -> None:
        found = await self._active_account(email=email, phone=phone)
        if found is None:
            raise InvalidVerificationCode()
        account, customer = found
        row = await self._check_code(RESET, account.email, code)
        await self._set_password(account, password)
        row.consumed_at = _now()
        self._audit(customer, "customer.account.password_reset")
        await self.session.commit()

    async def change_password(self, customer: Customer, payload: dict,
                              current_password: str, new_password: str) -> dict:
        account = await self._token_account(payload)
        if not verify_password(current_password, account.password_hash):
            raise CurrentPasswordInvalid()
        await self._set_password(account, new_password)
        self._audit(customer, "customer.account.password_change")
        await self.session.flush()
        # This device stays signed in with a fresh session; others are revoked.
        return await CustomerAuthService(self.uow)._tokens(customer, account)

    async def _token_account(self, payload: dict) -> CustomerAccount:
        # get_current_customer already validated the token against this account.
        account = await self.session.scalar(select(CustomerAccount).where(
            CustomerAccount.id == uuid.UUID(payload["account_id"])).with_for_update())
        if account is None:
            raise InvalidCredentials()
        return account

    # ── deletion ────────────────────────────────────────────────────────────
    async def delete_account(self, customer: Customer, payload: dict, password: str | None) -> None:
        account = await self._token_account(payload)
        if not password or not verify_password(password, account.password_hash):
            raise CurrentPasswordInvalid()
        customer = await self.session.scalar(select(Customer).where(Customer.id == customer.id)
                                             .with_for_update().execution_options(populate_existing=True))
        await AuthSessionService(self.session).revoke_principal("customer", customer.id)
        await self.session.execute(delete(CustomerAccount).where(CustomerAccount.customer_id == customer.id))
        await self.session.execute(delete(PushDevice).where(PushDevice.customer_id == customer.id))
        customer.full_name = "Deleted customer"
        customer.phone = customer.email = customer.address = customer.notes = None
        customer.telegram_id = customer.telegram_username = None
        customer.is_active = False
        self._audit(customer, "customer.account.delete")
        await self.session.commit()
