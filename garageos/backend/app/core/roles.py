"""Canonical role catalog and access policy.

The role *records* live in the DB (seeded by ``app.seeds.roles``); these are the
stable string identities the code checks against. Keeping them here — rather than
as free-floating string literals scattered across endpoints — means a typo is a
NameError, and the policy sets below read as a single legible access matrix.

Tenant capabilities are enforced by ``app.core.staff_access`` and endpoint
dependencies. Platform flags never bypass tenant ownership checks.
"""
from __future__ import annotations

# ─── Role identities (must match app/seeds/roles.py names) ───────────────────
SUPER_ADMIN = "super_admin"
ADMIN = "admin"
MANAGER = "manager"
MECHANIC = "mechanic"
RECEPTIONIST = "receptionist"

# Employee roles assignable by the tenant owner. Owner and platform identities
# remain protected by the current StaffService policy.
ASSIGNABLE_ROLES: tuple[str, ...] = (MANAGER, RECEPTIONIST, MECHANIC)

ALL_ROLES: frozenset[str] = frozenset({SUPER_ADMIN, ADMIN, *ASSIGNABLE_ROLES})

# ─── Access policy sets ──────────────────────────────────────────────────────
# Who may administer the tenant: manage staff, assign roles, edit settings.
# Platform administrators do not receive tenant owner access.
TEAM_MANAGE: frozenset[str] = frozenset({ADMIN})

# Front-office staff who can run the day-to-day desk (booking, billing, CRM).
FRONT_OFFICE: frozenset[str] = frozenset({ADMIN, MANAGER, RECEPTIONIST})


def is_valid_role(name: str | None) -> bool:
    return name in ALL_ROLES
