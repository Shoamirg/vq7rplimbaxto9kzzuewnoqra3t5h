"""Vehicle Health API service (Sprint 3 / signature feature).

Composes the maintenance engine into the payloads the Vehicle Health screen and
Fleet Health widget need — health score, category breakdown, per-service status,
timeline, and a fleet aggregate. All tenant-scoped via the UnitOfWork.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List

from app.exceptions import VehicleNotFound
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.vehicle_repository import VehicleRepository
from app.services.maintenance_service import MaintenanceResult, MaintenanceService

_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _band(score: float) -> str:
    if score >= 80:
        return "good"
    if score >= 50:
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
