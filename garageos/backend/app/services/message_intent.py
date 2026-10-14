"""Versioned effective-content fingerprints and trusted submission identity."""
import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Literal

from app.exceptions import ConflictError, ValidationError

FINGERPRINT_VERSION = 1


class MessageIntentConflict(ConflictError):
    code = "MESSAGE_INTENT_CONFLICT"
    detail = "This submission key was already used for different message content"


class MessageIntentContentInvalid(ValidationError):
    detail = "Message metadata must contain finite JSON values"


@dataclass(frozen=True)
class MessageSubmission:
    """Constructed only by authenticated entry points, never from request JSON."""
    key: uuid.UUID
    actor_kind: Literal["staff", "customer"]
    actor_id: uuid.UUID
    # Only dispatcher/manager null/absent/empty names invoke the staff default.
    # Customer names are server-derived and therefore never request content.
    author_name_input: str | None = None


def fingerprint(*, submission: MessageSubmission, body, kind, channel, internal,
                author_role, mentions, attachments) -> str:
    author_name_input = None
    if submission.actor_kind == "staff":
        author_name_input = submission.author_name_input
        if author_role in ("dispatcher", "manager"):
            author_name_input = author_name_input or None
    content = {
        "version": FINGERPRINT_VERSION, "body": body, "kind": kind,
        "channel": channel, "is_internal": internal, "author_role": author_role,
        "author_name_input": author_name_input,
        "mentions": mentions or [],
        "attachments": [{"kind": a.get("kind", "photo"), "label": a["label"],
                         "url": a.get("url"), "meta": a.get("meta")} for a in attachments or []],
    }
    try:
        canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except ValueError as error:
        raise MessageIntentContentInvalid() from error
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
