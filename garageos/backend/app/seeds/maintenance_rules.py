"""Seed per-tenant maintenance rules from data/maintenance_rules.json.

Rules are tenant-scoped (service_center_id) and brand-linked. The standard rule
set is applied to every brand for the given service center. Idempotent on
(service_center_id, brand_id, service_type).
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Brand, MaintenanceRule, ServiceCenter
from app.seeds.base import get_or_create, load_json


async def seed_maintenance_rules(
    session: AsyncSession,
    service_center: ServiceCenter,
    brands: dict[str, Brand],
) -> list[MaintenanceRule]:
    rules_data = load_json("maintenance_rules.json")
    created: list[MaintenanceRule] = []
    for brand in brands.values():
        for entry in rules_data:
            rule, _ = await get_or_create(
                session,
                MaintenanceRule,
                defaults={
                    "description": entry.get("description"),
                    "interval_km": entry.get("interval_km"),
                    "interval_months": entry.get("interval_months"),
                    "estimated_duration_minutes": entry.get("estimated_duration_minutes"),
                    "estimated_cost": entry.get("estimated_cost"),
                    "is_required": entry.get("is_required", True),
                    "sort_order": entry.get("sort_order", 0),
                },
                service_center_id=service_center.id,
                brand_id=brand.id,
                service_type=entry["service_type"],
            )
            created.append(rule)
    return created
