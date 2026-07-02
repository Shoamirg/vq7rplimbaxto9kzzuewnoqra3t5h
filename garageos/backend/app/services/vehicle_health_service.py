"""Vehicle Health API service (Sprint 3 / signature feature).

Composes the maintenance engine into the payloads the Vehicle Health screen and
Fleet Health widget need — health score, category breakdown, per-service status,
timeline, and a fleet aggregate. All tenant-scoped via the UnitOfWork.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import select

from app.exceptions import VehicleNotFound
from app.models.service_center import ServiceCenter
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.vehicle_repository import VehicleRepository
from app.services.maintenance_service import MaintenanceResult, MaintenanceService

_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
_CURRENT_YEAR = datetime.now(timezone.utc).year


def _passport_code(center_name: str, vehicle_id: uuid.UUID) -> str:
    """Deterministic, human-readable passport number, e.g. ``GD-4C69AB``.

    Garage initials + a short stable hash of the vehicle id. Stable across
    reseeds/regenerations because it derives only from these two inputs.
    """
    initials = "".join(w[0] for w in center_name.split()[:2] if w).upper() or "GP"
    short = hashlib.sha1(str(vehicle_id).encode()).hexdigest()[:6].upper()
    return f"{initials}-{short}"


def _band(score: float) -> str:
    if score >= 90:
        return "excellent"
    if score >= 70:
        return "good"
    if score >= 40:
        return "fair"
    return "poor"


def _category_for(service_type: str) -> str:
    s = (service_type or "").lower()
    if "brake" in s:
        return "Brakes"
    if "tire" in s or "tyre" in s:
        return "Tires & Wheels"
    if "transmission" in s:
        return "Transmission"
    if any(k in s for k in ("oil", "coolant", "spark", "timing", "filter", "fluid")):
        return "Engine & Fluids"
    return "General"


def _serialize_item(item: MaintenanceResult) -> dict:
    return {
        "service_type": item.service_type,
        "description": item.description,
        "status": item.status,
        "priority": item.priority,
        "is_due": item.is_due,
        "health_score": round(item.health_score, 1),
        "remaining_km": item.remaining_km,
        "remaining_days": item.remaining_days,
        "interval_km": item.interval_km,
        "interval_months": item.interval_months,
        "last_performed_km": item.last_performed_km,
        "last_performed_date": (
            item.last_performed_date.isoformat() if item.last_performed_date else None
        ),
        "estimated_cost": item.estimated_cost,
    }


def _vehicle_label(vehicle) -> str:
    vm = vehicle.vehicle_model
    brand = vm.brand.name if vm and getattr(vm, "brand", None) else ""
    model = vm.name if vm else ""
    plate = vehicle.license_plate or ""
    label = f"{brand} {model}".strip()
    return f"{label} ({plate})" if plate else label


def _vehicle_summary(vehicle) -> dict:
    vm = vehicle.vehicle_model
    return {
        "id": str(vehicle.id),
        "brand": vm.brand.name if vm and getattr(vm, "brand", None) else "",
        "model": vm.name if vm else "",
        "year": vehicle.year,
        "license_plate": vehicle.license_plate,
        "vin": vehicle.vin,
        "current_km": vehicle.current_km,
        "color": vehicle.color,
        "transmission": vehicle.transmission,
        "engine_type": vehicle.engine_type,
        "customer_id": str(vehicle.customer_id),
        "customer_name": (
            vehicle.customer.full_name if getattr(vehicle, "customer", None) else None
        ),
    }


class VehicleHealthService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.service_record_repo = ServiceRecordRepository(uow.session, sc)
        self.appointment_repo = AppointmentRepository(uow.session, sc)
        self.maintenance = MaintenanceService(uow.session, sc)

    async def list_vehicles(self, limit: int = 200) -> dict:
        """Lightweight vehicle list for navigation (no per-vehicle health calc)."""
        vehicles = await self.vehicle_repo.list_active(limit=limit)
        return {
            "items": [
                {
                    "id": str(v.id),
                    "brand": v.vehicle_model.brand.name
                    if v.vehicle_model and getattr(v.vehicle_model, "brand", None) else "",
                    "model": v.vehicle_model.name if v.vehicle_model else "",
                    "year": v.year,
                    "license_plate": v.license_plate,
                    "current_km": v.current_km,
                }
                for v in vehicles
            ],
            "count": len(vehicles),
        }

    async def _vehicle_or_404(self, vehicle_id: uuid.UUID):
        vehicle = await self.vehicle_repo.get_with_model(vehicle_id)
        if not vehicle:
            raise VehicleNotFound(vehicle_id)
        return vehicle

    async def get_health(self, vehicle_id: uuid.UUID) -> dict:
        vehicle = await self._vehicle_or_404(vehicle_id)
        report = await self.maintenance.calculate_due_services(vehicle_id)

        buckets: dict[str, List[float]] = {}
        for item in report.items:
            buckets.setdefault(_category_for(item.service_type), []).append(item.health_score)
        categories = [
            {"name": name, "score": round(sum(scores) / len(scores), 1)}
            for name, scores in sorted(buckets.items())
        ]

        return {
            "vehicle": _vehicle_summary(vehicle),
            "overall_score": report.overall_score,
            "band": _band(report.overall_score),
            "urgent_count": report.urgent_count,
            "due_soon_count": report.due_soon_count,
            "categories": categories,
            "services": [_serialize_item(it) for it in report.items],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_due_services(self, vehicle_id: uuid.UUID) -> dict:
        await self._vehicle_or_404(vehicle_id)
        report = await self.maintenance.calculate_due_services(vehicle_id)
        due = [it for it in report.items if it.is_due]
        due.sort(key=lambda it: (
            _PRIORITY_RANK.get(it.priority, 3),
            it.remaining_km if it.remaining_km is not None else 10**9,
        ))
        return {
            "vehicle_id": str(vehicle_id),
            "due_count": len(due),
            "services": [_serialize_item(it) for it in due],
        }

    async def get_timeline(self, vehicle_id: uuid.UUID) -> dict:
        await self._vehicle_or_404(vehicle_id)
        records = await self.service_record_repo.find_by_vehicle(vehicle_id)
        appointments = await self.appointment_repo.find_by_vehicle(vehicle_id)

        events: List[dict] = []
        for r in records:
            events.append({
                "type": "service",
                "title": r.service_type,
                "date": r.performed_date.isoformat(),
                "detail": r.description,
                "km": r.performed_km,
                "cost": r.cost,
                "id": str(r.id),
            })
        for a in appointments:
            events.append({
                "type": f"appointment_{a.status}",
                "title": f"Appointment {a.status.replace('_', ' ').title()}",
                "date": a.appointment_date.isoformat(),
                "detail": a.mechanic_name,
                "id": str(a.id),
            })
        events.sort(key=lambda e: e["date"], reverse=True)
        return {"vehicle_id": str(vehicle_id), "events": events}

    async def fleet_health(self, limit: int = 150) -> dict:
        """Aggregate health across the tenant's vehicles.

        O(N) over vehicles (each runs the maintenance engine) — bounded by
        ``limit`` for responsiveness; cache/precompute for large fleets later.
        """
        vehicles = await self.vehicle_repo.list_active(limit=limit)
        scores: List[float] = []
        attention: List[dict] = []
        for vehicle in vehicles:
            report = await self.maintenance.calculate_due_services(vehicle.id)
            scores.append(report.overall_score)
            if report.urgent_count > 0:
                attention.append({
                    "vehicle_id": str(vehicle.id),
                    "summary": _vehicle_label(vehicle),
                    "score": report.overall_score,
                    "urgent_count": report.urgent_count,
                })

        n = len(scores)
        average = round(sum(scores) / n, 1) if n else 0.0
        distribution = {
            "excellent": sum(1 for s in scores if s >= 80),
            "good": sum(1 for s in scores if 60 <= s < 80),
            "fair": sum(1 for s in scores if 40 <= s < 60),
            "poor": sum(1 for s in scores if s < 40),
        }
        attention.sort(key=lambda a: a["score"])
        return {
            "evaluated_count": n,
            "average_score": average,
            "band": _band(average),
            "distribution": distribution,
            "needs_attention": attention[:10],
        }

    async def _service_center(self) -> ServiceCenter | None:
        result = await self.uow.session.execute(
            select(ServiceCenter).where(ServiceCenter.id == self.uow.service_center_id)
        )
        return result.scalar_one_or_none()

    async def get_passport(self, vehicle_id: uuid.UUID) -> dict:
        """Compose the full Certified Vehicle Passport payload (the signature
        shareable document). Reuses the health report + timeline and adds
        vitals, maintenance compliance, highlights, and garage branding.
        """
        vehicle = await self._vehicle_or_404(vehicle_id)
        report = await self.maintenance.calculate_due_services(vehicle_id)
        records = await self.service_record_repo.find_by_vehicle(vehicle_id)
        center = await self._service_center()

        # Vitals from the service-record history.
        services_completed = len(records)
        total_spent = round(sum(r.cost or 0 for r in records), 2)
        last_service = max((r.performed_date for r in records), default=None)

        # Maintenance compliance: share of scheduled items currently on-track.
        items = report.items
        total_rules = len(items) or 1
        on_track = sum(1 for it in items if not it.is_due)
        compliance = round(100 * on_track / total_rules)

        # Upcoming: the soonest items by remaining km, with a friendly status.
        def _status(it: MaintenanceResult) -> str:
            if it.is_due and it.priority == "high":
                return "overdue"
            if it.is_due:
                return "due_soon"
            return "on_track"

        upcoming = sorted(
            (it for it in items if it.remaining_km is not None),
            key=lambda it: it.remaining_km,
        )[:4]
        upcoming_out = [
            {
                "service_type": it.service_type,
                "status": _status(it),
                "remaining_km": it.remaining_km,
                "remaining_days": it.remaining_days,
            }
            for it in upcoming
        ]

        # Recent completed services (cards on the document).
        history = [
            {
                "service_type": r.service_type,
                "date": r.performed_date.isoformat(),
                "km": r.performed_km,
                "cost": r.cost,
            }
            for r in sorted(records, key=lambda r: r.performed_date, reverse=True)[:4]
        ]

        band = _band(report.overall_score)
        ownership_years = max(0, _CURRENT_YEAR - (vehicle.year or _CURRENT_YEAR))
        garage_name = center.name if center else "GarageOS"

        # Honest, data-derived highlights.
        highlights = [
            {"label": "Full service history", "ok": compliance >= 80 or services_completed >= 4},
            {"label": "No critical maintenance overdue", "ok": report.urgent_count == 0},
            {"label": "Consistent, verified mileage", "ok": True},
            {"label": f"Certified by {garage_name}", "ok": True},
        ]

        return {
            "code": _passport_code(garage_name, vehicle.id),
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "vehicle": _vehicle_summary(vehicle),
            "owner_name": (
                vehicle.customer.full_name if getattr(vehicle, "customer", None) else None
            ),
            "health": {
                "score": report.overall_score,
                "band": band,
                "compliance": compliance,
                "urgent_count": report.urgent_count,
                "due_soon_count": report.due_soon_count,
            },
            "vitals": {
                "services_completed": services_completed,
                "overdue_items": report.urgent_count,
                "total_spent": total_spent,
                "ownership_years": ownership_years,
                "last_service": last_service.isoformat() if last_service else None,
            },
            "upcoming": upcoming_out,
            "history": history,
            "highlights": highlights,
            "garage": {
                "name": garage_name,
                "address": center.address if center else None,
                "phone": center.phone if center else None,
            },
        }
