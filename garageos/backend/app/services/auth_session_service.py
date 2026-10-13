"""Small shared session boundary; callers pin current identity before rotation."""
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.exceptions import InvalidToken
from app.models.auth_session import AuthSession


def _uuid(value):
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise InvalidToken() from None


def _digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuthSessionService:
    def __init__(self, session):
        self.session = session

    @staticmethod
    def proof(token, kind):
        payload = decode_token(token)
        access, refresh = ("access", "refresh") if kind == "staff" else ("customer_access", "customer_refresh")
        if not payload or payload.get("type") not in (access, refresh):
            raise InvalidToken()
        _uuid(payload.get("sub"))
        _uuid(payload.get("sid"))
        if payload["type"] == refresh:
            _uuid(payload.get("jti"))
        return payload

    async def load(self, payload, kind, *, lock=False, active=True, read_lock=False):
        statement = select(AuthSession).where(AuthSession.id == _uuid(payload.get("sid")))
        if lock or read_lock:
            statement = statement.with_for_update(read=read_lock).execution_options(populate_existing=True)
        row = await self.session.scalar(statement)
        subject = _uuid(payload.get("sub"))
        if row is None or row.principal_kind != kind or subject != (row.user_id if kind == "staff" else row.customer_id):
            raise InvalidToken()
        if str(row.service_center_id) != payload.get("scid") or bool(payload.get("demo")) != row.demo:
            raise InvalidToken()
        if (str(row.customer_account_id) if row.customer_account_id is not None else None) != payload.get("account_id"):
            raise InvalidToken()
        if row.account_version != payload.get("account_version"):
            raise InvalidToken()
        if active and (row.revoked_at is not None or row.expires_at <= datetime.now(timezone.utc)):
            raise InvalidToken()
        return row

    def tokens(self, row, claims):
        common = {**claims, "sid": str(row.id), "scid": str(row.service_center_id)}
        access_type, refresh_type = ("access", "refresh") if row.principal_kind == "staff" else ("customer_access", "customer_refresh")
        access_ttl = min(timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), row.expires_at - datetime.now(timezone.utc))
        if access_ttl.total_seconds() <= 0:
            raise InvalidToken()
        access = create_access_token({**common, "type": access_type}, expires_delta=access_ttl)
        refresh = create_refresh_token({**common, "type": refresh_type, "jti": str(uuid.uuid4())}, expires_at=row.expires_at)
        row.refresh_digest = _digest(refresh)
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}

    async def issue(self, *, kind, principal_id, center_id, claims):
        row = AuthSession(id=uuid.uuid4(), principal_kind=kind,
            user_id=principal_id if kind == "staff" else None,
            customer_id=principal_id if kind == "customer" else None,
            service_center_id=center_id, demo=bool(claims.get("demo")),
            customer_account_id=_uuid(claims["account_id"]) if claims.get("account_id") else None,
            account_version=claims.get("account_version"),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
        tokens = self.tokens(row, claims)
        self.session.add(row)
        # This service must finish BEFORE the first HTTP success can be sent.
        # Also commits Telegram linking/account updates in the same transaction.
        await self.session.commit()
        return tokens

    async def rotate(self, token, payload, kind, claims):
        row = await self.load(payload, kind, lock=True)
        if not hmac.compare_digest(row.refresh_digest, _digest(token)):
            row.revoked_at = datetime.now(timezone.utc)
            # A later401 dependency rollback must not resurrect this family.
            await self.session.commit()
            raise InvalidToken()
        tokens = self.tokens(row, claims)
        await self.session.commit()
        return tokens

    async def logout(self, token, kind):
        payload = self.proof(token, kind)
        row = await self.load(payload, kind, lock=True, active=False)
        if row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
        await self.session.commit()

    async def revoke_principal(self, kind, principal_id, *, customer_account_id=None):
        column = AuthSession.user_id if kind == "staff" else AuthSession.customer_id
        statement = update(AuthSession).where(
            AuthSession.principal_kind == kind, column == principal_id,
            AuthSession.revoked_at.is_(None))
        if customer_account_id is not None:
            statement = statement.where(AuthSession.customer_account_id == customer_account_id)
        await self.session.execute(statement.values(revoked_at=datetime.now(timezone.utc)))
