from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


_dummy_hash: Optional[str] = None


def burn_password_check(password: str) -> None:
    """Spend one bcrypt verification when no real hash exists.

    Login paths call this for unknown or disabled identities so the response
    time does not reveal which emails are registered.
    """
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = pwd_context.hash("garageos-timing-equalizer")
    pwd_context.verify(password, _dummy_hash)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict, *, expires_at: Optional[datetime] = None) -> str:
    to_encode = data.copy()
    expire = expires_at or datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"require": ["exp"]})
    except (InvalidTokenError, ValueError, TypeError, OverflowError):
        return None
