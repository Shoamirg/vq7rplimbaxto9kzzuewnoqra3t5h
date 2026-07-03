"""Orchestrate a full, realistic demo database.

    python -m app.seeds.demo            # idempotent: safe to run repeatedly
    python -m app.seeds.demo --fresh    # wipe tenant demo data first, then reseed

Global reference data (roles, brands, models) is always upserted. Bulk tenant
data (customers, vehicles, appointments, service records) is generated only when
the demo tenant is empty, unless --fresh is passed.
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
    ServiceCenter,
    ServiceRecord,
    User,
    Vehicle,
)
from app.seeds.appointments import generate_appointments
from app.seeds.brands import seed_brands
from app.seeds.customers import generate_customers
from app.seeds.maintenance_rules import seed_maintenance_rules
from app.seeds.mechanics import seed_staff
from app.seeds.models import seed_vehicle_models
from app.seeds.roles import seed_roles
from app.seeds.service_centers import seed_service_center
from app.seeds.cases import generate_cases
from app.seeds.conversations import generate_conversations
from app.seeds.invoices import generate_invoices, generate_invoice_history
from app.seeds.fleet import generate_fleet_vehicles
from app.seeds.notifications import generate_notifications

logger = logging.getLogger("seeds.demo")

# --- Demo tenant definitions -------------------------------------------------
PRIMARY = {
    "name": "GarageOS Demo Workshop",
    "email": "demo@garageos.app",
    "phone": "+15550100100",
    "address": "100 Main Street, Springfield",
    "timezone": "UTC",
    "brand_name": "GarageOS Demo Workshop",
    "tagline": "Precision Auto Care",
    "monogram": "G",
    "primary_color": "#2563EB",   # signature blue
    "accent_color": "#2563EB",
    "slug": "garageos-demo",
}
SECOND = {
    "name": "Northside Auto (Tenant B)",
    "email": "northside@garageos.app",
    "phone": "+15550200200",
    "address": "42 North Avenue, Rivertown",
    "timezone": "UTC",
    "brand_name": "Northside Auto",
    "tagline": "Off-Road & 4x4 Specialists",
    "monogram": "N",
    "primary_color": "#EA580C",   # rugged orange — proves white-label
    "accent_color": "#EA580C",
    "slug": "northside",
}

# Service histories are generated per-vehicle by the fleet generator (they set
# each vehicle's health), so there's no separate service-record volume knob.
# The primary tenant is sized as a full, busy shop so every screen looks its best
# in a demo: a large fleet, a deep customer book, and 8 mechanic lanes on the
# board. NOTE: the appointment schedule is slot-driven (mechanics × days × slots ×
# fill), so `mechanics` — not `appointments` — is what fills the calendar.
PRIMARY_VOLUME = {"mechanics": 8, "customers": 250, "vehicles": 720, "appointments": 40}
SECOND_VOLUME = {"mechanics": 2, "customers": 15, "vehicles": 20, "appointments": 6}

# Tenant-scoped tables, in safe deletion order (children before parents).
_TENANT_TABLES = [LedgerEntry, Payment, InvoiceLineItem, Invoice, Attachment, Message, Participant, Conversation, OperationalCase, Notification, ServiceRecord, AppointmentSlot, Appointment, Vehicle, Customer, MaintenanceRule, User]


async def _wipe_tenant(session: AsyncSession, center: ServiceCenter) -> None:
    for model in _TENANT_TABLES:
        await session.execute(
            delete(model).where(model.service_center_id == center.id)
        )
    logger.info("Wiped tenant data for %s", center.name)


async def _count(session: AsyncSession, model, center: ServiceCenter) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.service_center_id == center.id)
    )
    return int(result.scalar_one())


async def _seed_tenant(
    session: AsyncSession,
    spec: dict,
    volume: dict,
    roles: dict,
    brands: dict,
    models: list,
    *,
    fresh: bool,
    telegram_base: int,
) -> ServiceCenter:
    center = await seed_service_center(session, **spec)

    if fresh:
        await _wipe_tenant(session, center)

    # Per-tenant slug from the center email local-part (e.g. demo, northside),
    # used to namespace staff emails so tenants never share accounts.
    tenant_slug = spec["email"].split("@", 1)[0]
    staff = await seed_staff(
        session, center, roles,
        tenant_slug=tenant_slug, mechanic_count=volume["mechanics"],
    )
    rules = await seed_maintenance_rules(session, center, brands)

    existing = await _count(session, Customer, center)
    if existing and not fresh:
        logger.info(
            "%s already has %d customers; skipping bulk generation (use --fresh to reseed)",
            center.name, existing,
        )
        return center

    customers = await generate_customers(
        session, center, volume["customers"], telegram_id_start=telegram_base
    )
    # The whole fleet is generated with engineered service histories so health
    # spans a realistic, healthy-leaning distribution (mostly excellent/good, a
    # small poor tail). This is what makes Demo Mode a polished, known state.
    vehicles = await generate_fleet_vehicles(
        session, center, customers, models, rules, volume["vehicles"]
    )

    await generate_appointments(
        session, center, vehicles, staff["mechanics"], rules, volume["appointments"]
    )
    await generate_notifications(session, center, vehicles)
    await generate_cases(session, center, vehicles, staff["mechanics"])
    await generate_conversations(session, center, vehicles, staff["mechanics"])
    await generate_invoices(session, center, vehicles)
    await generate_invoice_history(session, center, vehicles)
    logger.info(
        "Seeded %s: %d customers, %d vehicles",
        center.name, len(customers), len(vehicles),
    )
    return center


async def run(fresh: bool = False) -> None:
    setup_logging()
    # Idempotently create any missing tables so a --fresh reseed works even when
    # new models (e.g. the conversation aggregate) were added since the DB was built.
    await init_db()
    async with async_session_factory() as session:
        # Global reference data.
        roles = await seed_roles(session)
        brands = await seed_brands(session)
        models = await seed_vehicle_models(session, brands)
        logger.info("Reference data: %d roles, %d brands, %d models",
                    len(roles), len(brands), len(models))

        # Distinct telegram-id bases per tenant — telegram_id is globally unique.
        primary = await _seed_tenant(
            session, PRIMARY, PRIMARY_VOLUME, roles, brands, models,
            fresh=fresh, telegram_base=100_000_000,
        )
        second = await _seed_tenant(
            session, SECOND, SECOND_VOLUME, roles, brands, models,
            fresh=fresh, telegram_base=200_000_000,
        )

        await session.commit()
        await _print_summary(session, [primary, second])

    await engine.dispose()


async def _print_summary(session: AsyncSession, centers: list[ServiceCenter]) -> None:
    print("\n=== Seed summary ===")
    for center in centers:
        counts = {
            "users": await _count(session, User, center),
            "customers": await _count(session, Customer, center),
            "vehicles": await _count(session, Vehicle, center),
            "appointments": await _count(session, Appointment, center),
            "service_records": await _count(session, ServiceRecord, center),
            "maintenance_rules": await _count(session, MaintenanceRule, center),
        }
        print(f"\n  {center.name}  [{center.id}]")
        for key, value in counts.items():
            print(f"    {key:18} {value}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the GarageOS demo database.")
    parser.add_argument(
        "--fresh", action="store_true", help="Wipe tenant demo data before reseeding."
    )
    args = parser.parse_args()
    asyncio.run(run(fresh=args.fresh))


if __name__ == "__main__":
    main()
