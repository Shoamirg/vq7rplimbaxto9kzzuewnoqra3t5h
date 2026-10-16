"""Vehicle Intelligence Center — one composed payload for the signature screen.

Answers "what should I know about this vehicle right now?" by projecting over
everything already built: health (subsystems), the vehicle service record,
maintenance due-list, the service timeline, and the OWNER's Commercial Health.
Predictions are deterministic (derived from the maintenance engine + health
trends), consistent with the honest, non-LLM approach used in Reports.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.exceptions import VehicleNotFound
from app.models.customer import Customer
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.services.financial_service import FinancialService, commercial_health
from app.services.vehicle_health_service import VehicleHealthService, _band

_MAINTENANCE_ATTENTION = {"excellent": "Low", "good": "Low", "fair": "Medium", "poor": "High"}
_SPEND_TIER = [(8000, "Platinum"), (4000, "Gold"), (1500, "Silver")]


def _tier_from_score(score: float) -> str | None:
    if score >= 90:
        return "Gold"
    if score >= 75:
        return "Silver"
    if score >= 60:
        return "Bronze"
    return None


class VehicleIntelligenceService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id

    async def get(self, vehicle_id: uuid.UUID) -> dict:
        vehicle = (await self.session.execute(
            select(Vehicle)
            .where(Vehicle.id == vehicle_id, Vehicle.service_center_id == self.sc,
                   Vehicle.is_active == True)  # noqa: E712
            .options(
                selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand),
                selectinload(Vehicle.customer),
            )
        )).scalar_one_or_none()
        if vehicle is None:
            raise VehicleNotFound(vehicle_id)

        health_svc = VehicleHealthService(self.uow)
        health = await health_svc.get_health(vehicle_id)
        passport = await health_svc.get_passport(vehicle_id)
        timeline = await health_svc.get_timeline(vehicle_id)
        due = await health_svc.get_due_services(vehicle_id)

        owner = vehicle.customer
        commercial = await self._commercial(owner)
        vehicle_count = await self.session.scalar(
            select(func.count()).select_from(Vehicle).where(
                Vehicle.customer_id == owner.id, Vehicle.is_active == True)  # noqa: E712
        ) if owner else 0

        return {
            "identity": self._identity(vehicle, owner, health),
            "health": {
                "overall_score": health["overall_score"],
                "band": health["band"],
                "urgent_count": health["urgent_count"],
                "due_soon_count": health["due_soon_count"],
                "subsystems": health["categories"],  # [{name, score}]
            },
            "passport": {
                "code": passport["code"],
                "tier": _tier_from_score(health["overall_score"]),
                "compliance": passport["health"]["compliance"],
                "vitals": passport["vitals"],
                "highlights": passport["highlights"],
            },
            "commercial": commercial,
            "predictions": self._predictions(health, due),
            "maintenance": self._maintenance(due),
            "timeline": timeline["events"][:12],
            "owner_context": {
                "id": str(owner.id) if owner else None,
                "name": owner.full_name if owner else None,
                "vehicle_count": int(vehicle_count or 0),
                "spend_tier": commercial.get("spend_tier") if commercial else None,
            } if owner else None,
        }

    def _identity(self, v: Vehicle, owner: Customer | None, health: dict) -> dict:
        vm = v.vehicle_model
        return {
            "id": str(v.id),
            "brand": vm.brand.name if vm and getattr(vm, "brand", None) else "",
            "model": vm.name if vm else "",
            "year": v.year,
            "plate": v.license_plate,
            "vin": v.vin,
            "mileage": v.current_km,
            "color": v.color,
            "engine": v.engine_type,
            "transmission": v.transmission,
            "owner_name": owner.full_name if owner else None,
            "band": health["band"],
        }

    async def _commercial(self, owner: Customer | None) -> dict | None:
        if owner is None:
            return None
        s = await FinancialService(self.uow).customer_summary(owner.id)
        health = s["commercial_health"]
        lifetime = s["lifetime_spend"]
        legacy_usd_spend = s["by_currency"].get("USD", {}).get("lifetime_spend", 0)
        tier = next((name for threshold, name in _SPEND_TIER if legacy_usd_spend >= threshold), None)
        return {
            "score": health["score"],
            "stars": health["stars"],
            "band": health["band"],
            "label": health["label"],
            "outstanding": s["outstanding"],
            "lifetime_value": lifetime,
            "currency": s["currency"],
            "outstanding_by_currency": {currency: values["outstanding"] for currency, values in s["by_currency"].items()},
            "lifetime_value_by_currency": {currency: values["lifetime_spend"] for currency, values in s["by_currency"].items()},
            "avg_days_to_pay": s["avg_days_to_pay"],
            "preferred_method": s["preferred_method"],
            "spend_tier": tier,
        }

    def _predictions(self, health: dict, due: dict) -> list[dict]:
        out: list[dict] = []
        # soonest due service
        services = due.get("services", [])
        if services:
            top = services[0]
            when = (f"{top['remaining_days']} days" if top.get("remaining_days") is not None
                    else f"{top['remaining_km']:,} km" if top.get("remaining_km") is not None else "soon")
            out.append({
                "code": "next", "params": {"service": top["service_type"],
                    "days": top.get("remaining_days"), "km": top.get("remaining_km")},
                "tone": "info", "icon": "wrench",
                "title": f"Next service: {top['service_type']} in {when}",
                "detail": "Based on mileage and service intervals.",
            })
        # weakest subsystem
        cats = sorted(health.get("categories", []), key=lambda c: c["score"])
        if cats and cats[0]["score"] < 75:
            c = cats[0]
            out.append({
                "code": "attention", "params": {"system": c["name"], "score": round(c["score"])},
                "tone": "warning", "icon": "activity",
                "title": f"{c['name']} needs attention ({round(c['score'])})",
                "detail": "Lowest-scoring system — inspect at the next visit.",
            })
        # overdue
        if health.get("urgent_count", 0) > 0:
            out.append({
                "code": "overdue", "params": {"count": health["urgent_count"]},
                "tone": "danger", "icon": "alert",
                "title": f"{health['urgent_count']} item(s) overdue",
                "detail": "Review the tracked maintenance items that are due.",
            })
        # Maintenance attention level derived from the tracked health band.
        risk = _MAINTENANCE_ATTENTION.get(health.get("band", ""), "Low")
        out.append({
            "code": "risk", "params": {"risk": risk.lower()},
            "tone": "success" if risk == "Low" else "warning" if risk == "Medium" else "danger",
            "icon": "activity",
            "title": f"Maintenance attention level: {risk}",
            "detail": "Estimated from tracked maintenance status; not a failure prediction.",
        })
        return out[:4]

    def _maintenance(self, due: dict) -> list[dict]:
        items = []
        for s in due.get("services", [])[:5]:
            items.append({
                "service_type": s["service_type"],
                "status": s.get("status"),
                "priority": s.get("priority"),
                "remaining_days": s.get("remaining_days"),
                "remaining_km": s.get("remaining_km"),
            })
        return items
