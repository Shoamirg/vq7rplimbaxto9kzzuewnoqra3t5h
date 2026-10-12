"""Seed staff users (admin + mechanics) for a service center.

Idempotent by unique email. Passwords are bcrypt-hashed via the app's security
helper so seeded accounts can actually log in.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Role, ServiceCenter, User
from app.seeds.base import get_or_create, rng

DEFAULT_PASSWORD = "parol12345"

MECHANIC_NAMES = [
    "Carlos Mendez", "Dmitri Volkov", "Sami Haddad", "Tom Becker",
    "Raj Patel", "Lukas Novak", "Andre Silva", "Wei Chen",
]


async def seed_staff(
    session: AsyncSession,
    service_center: ServiceCenter,
    roles: dict[str, Role],
    *,
    tenant_slug: str,
    mechanic_count: int = 6,
    email_domain: str = "garageos.app",
) -> dict[str, list[User]]:
    """Create one admin plus ``mechanic_count`` mechanics for this tenant.

    Staff emails are namespaced under a per-tenant subdomain
    (e.g. admin@demo.garageos.local) because ``User.email`` is globally unique —
    two tenants must not share staff accounts.
    """
    hashed = hash_password(DEFAULT_PASSWORD)
    domain = f"{tenant_slug}.{email_domain}"

    admin, _ = await get_or_create(
        session,
        User,
        defaults={
            "password_hash": hashed,
            "full_name": f"Admin ({service_center.name})",
            "phone": None,
            "role_id": roles["admin"].id,
            "is_super_admin": True,
            "service_center_id": service_center.id,
        },
        email=f"admin@{domain}",
    )

    mechanics: list[User] = []
    for name in MECHANIC_NAMES[:mechanic_count]:
        slug = name.lower().replace(" ", ".")
        mechanic, _ = await get_or_create(
            session,
            User,
            defaults={
                "password_hash": hashed,
                "full_name": name,
                "phone": f"+1{rng.randint(2000000000, 9999999999)}",
                "role_id": roles["mechanic"].id,
                "is_super_admin": False,
                "service_center_id": service_center.id,
            },
            email=f"{slug}@{domain}",
        )
        mechanics.append(mechanic)

    return {"admin": [admin], "mechanics": mechanics}
