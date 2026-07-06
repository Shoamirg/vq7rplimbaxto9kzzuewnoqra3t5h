"""Canonical role catalog and access policy.

The role *records* live in the DB (seeded by ``app.seeds.roles``); these are the
stable string identities the code checks against. Keeping them here — rather than
as free-floating string literals scattered across endpoints — means a typo is a
NameError, and the policy sets below read as a single legible access matrix.

Enforcement is role-based (see ``app.api.deps.require_roles``): each protected
endpoint declares which roles may reach it. ``super_admin`` always bypasses, so
it never needs to be listed in a policy set.
"""
from __future__ import annotations

# ─── Role identities (must match app/seeds/roles.py names) ───────────────────
SUPER_ADMIN = "super_admin"
ADMIN = "admin"
MANAGER = "manager"
MECHANIC = "mechanic"
RECEPTIONIST = "receptionist"

# Every assignable role, most-privileged first (drives the UI role dropdown and
# validates role-change requests). super_admin is platform-level and is not
# assignable through the tenant team UI.
ASSIGNABLE_ROLES: tuple[str, ...] = (ADMIN, MANAGER, RECEPTIONIST, MECHANIC)

ALL_ROLES: frozenset[str] = frozenset({SUPER_ADMIN, *ASSIGNABLE_ROLES})

# ─── Access policy sets ──────────────────────────────────────────────────────
# Who may administer the tenant: manage staff, assign roles, edit settings.
# super_admin bypasses require_roles, so it is intentionally omitted here.
TEAM_MANAGE: frozenset[str] = frozenset({ADMIN})

# Front-office staff who can run the day-to-day desk (booking, billing, CRM).
FRONT_OFFICE: frozenset[str] = frozenset({ADMIN, MANAGER, RECEPTIONIST})


def is_valid_role(name: str | None) -> bool:
    return name in ALL_ROLES
