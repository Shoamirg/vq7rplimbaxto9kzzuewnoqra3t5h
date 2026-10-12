"""Pure policy helpers for work-order roles and durable request identity."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.exceptions import UnauthorizedAction, WorkOrderNotFound


OFFICE_ROLES = frozenset({"admin", "manager", "receptionist"})
MECHANIC_ACTIONS = frozenset({"list", "read", "edit_work", "start", "ready"})
ALL_ACTIONS = frozenset({
    "list", "create", "read", "edit_fields", "edit_work", "assign",
    "start", "ready", "cancel", "complete",
})


def request_fingerprint(payload: dict[str, Any]) -> str:
    """Return a stable SHA-256 fingerprint for a validated JSON request body."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def require_work_order_action(
    role_name: str | None,
    *,
    role_active: bool,
    action: str,
    actor_user_id: Any = None,
    assigned_mechanic_user_id: Any = None,
) -> None:
    """Enforce a work-order action; hide unassigned work from mechanics as 404."""
    if not role_active or action not in ALL_ACTIONS:
        raise UnauthorizedAction()

    if role_name in OFFICE_ROLES:
        return

    if role_name != "mechanic" or action not in MECHANIC_ACTIONS:
        raise UnauthorizedAction()

    if action != "list" and actor_user_id != assigned_mechanic_user_id:
        raise WorkOrderNotFound()
