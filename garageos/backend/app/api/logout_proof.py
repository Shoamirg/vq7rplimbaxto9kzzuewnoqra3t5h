"""An explicit Authorization header always takes precedence over JSON proof."""
from fastapi import Request

from app.exceptions import InvalidToken
from app.schemas.auth import LogoutRequest


def logout_proof(request: Request, body: LogoutRequest | None) -> str:
    header = request.headers.get("authorization")
    if header is not None:
        scheme, separator, token = header.partition(" ")
        if scheme.casefold() != "bearer" or not separator or not token.strip():
            raise InvalidToken()
        return token.strip()
    if body is None:
        raise InvalidToken()
    return body.refresh_token
