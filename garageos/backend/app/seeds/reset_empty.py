"""Reset a tenant to a clean, empty slate — ready to be filled in by hand.

    python -m app.seeds.reset_empty                 # empty the primary demo tenant
    python -m app.seeds.reset_empty --tenant all    # empty every tenant
    python -m app.seeds.reset_empty --drop-catalog  # also clear the service catalog

What it deletes (per tenant): every customer, vehicle, appointment, service
record, invoice/estimate, payment, ledger entry, conversation, message, case,
notification — and all *mechanic* staff ("masters").

What it keeps: the tenant (garage) itself, the **admin login**, the service
catalog (maintenance rules & prices) unless --drop-catalog is passed, and all
global reference data (roles, brands, vehicle models).

This is fully reversible: `python -m app.seeds.demo --fresh` rebuilds the full
demo dataset at any time.
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, engine, init_db
from app.core.logging import setup_logging
from app.models import (
    Appointment,
    AppointmentSlot,
    Attachment,
    Conversation,
    Customer,
    Invoice,
    InvoiceLineItem,
    LedgerEntry,
    MaintenanceRule,
    Message,
    Notification,
    OperationalCase,
    Participant,
    Payment,
    Role,
    ServiceCenter,
    ServiceRecord,
    User,
    Vehicle,
)

logger = logging.getLogger("seeds.reset_empty")

# Primary demo tenant (the garage you log into with admin@demo.garageos.app).
PRIMARY_EMAIL = "demo@garageos.app"

# Operational tables to wipe, children before parents so no FK is left dangling.
# MaintenanceRule (the service catalog) is intentionally excluded here and only
# cleared when --drop-catalog is passed. User is handled separately so the admin
# login survives.
_OPERATIONAL_TABLES = [
    LedgerEntry,
    Payment,
    InvoiceLineItem,
    Invoice,
    Attachment,
    Message,
    Participant,
    Conversation,
    OperationalCase,
    Notification,
    ServiceRecord,
    AppointmentSlot,
    Appointment,
    Vehicle,
    Customer,
]


async def _count(session: AsyncSession, model, center: ServiceCenter) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.service_center_id == center.id)
    )
    return int(result.scalar_one())


async def _empty_tenant(
    session: AsyncSession, center: ServiceCenter, *, drop_catalog: bool
) -> None:
    # 1) Operational data.
    for model in _OPERATIONAL_TABLES:
        await session.execute(delete(model).where(model.service_center_id == center.id))

    # 2) Masters (mechanic staff) — every user in this tenant whose role is
    #    "mechanic". The admin/owner account is a different role and is kept, so
    #    you can still log in. All user FKs are ON DELETE SET NULL, so this is safe.
    mechanic_role = (
        await session.execute(select(Role).where(Role.name == "mechanic"))
    ).scalar_one_or_none()
    if mechanic_role is not None:
        await session.execute(
            delete(User).where(
                User.service_center_id == center.id,
                User.role_id == mechanic_role.id,
            )
        )

    # 3) Optionally the service catalog.
    if drop_catalog:
        await session.execute(
            delete(MaintenanceRule).where(MaintenanceRule.service_center_id == center.id)
        )

    logger.info("Emptied tenant %s (catalog %s)", center.name,
                "dropped" if drop_catalog else "kept")


async def run(*, tenant: str, drop_catalog: bool) -> None:
    setup_logging()
    await init_db()
    async with async_session_factory() as session:
        stmt = select(ServiceCenter)
        if tenant != "all":
            stmt = stmt.where(ServiceCenter.email == PRIMARY_EMAIL)
        centers = list((await session.execute(stmt)).scalars())
        if not centers:
            print(f"No tenant found (looked for {tenant!r}). Nothing to do.")
            return

        for center in centers:
            await _empty_tenant(session, center, drop_catalog=drop_catalog)

        await session.commit()
        await _print_summary(session, centers, drop_catalog=drop_catalog)

    await engine.dispose()


async def _print_summary(
    session: AsyncSession, centers: list[ServiceCenter], *, drop_catalog: bool
) -> None:
    print("\n=== Empty summary (kept: admin login" +
          ("" if drop_catalog else " + service catalog") + ") ===")
    for center in centers:
        counts = {
            "admins/staff kept": await _count(session, User, center),
            "customers": await _count(session, Customer, center),
            "vehicles": await _count(session, Vehicle, center),
            "appointments": await _count(session, Appointment, center),
            "invoices": await _count(session, Invoice, center),
            "service catalog": await _count(session, MaintenanceRule, center),
        }
        print(f"\n  {center.name}  [{center.id}]")
        for key, value in counts.items():
            print(f"    {key:18} {value}")
    print("\nReseed anytime with:  python -m app.seeds.demo --fresh\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Empty a GarageOS tenant to a blank slate.")
    parser.add_argument(
        "--tenant", default="primary", choices=["primary", "all"],
        help="Which tenant(s) to empty (default: primary demo tenant).",
    )
    parser.add_argument(
        "--drop-catalog", action="store_true",
        help="Also delete the service catalog (maintenance rules & prices).",
    )
    args = parser.parse_args()
    asyncio.run(run(tenant=args.tenant, drop_catalog=args.drop_catalog))


if __name__ == "__main__":
    main()
