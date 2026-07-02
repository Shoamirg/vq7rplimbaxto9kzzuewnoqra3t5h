from __future__ import annotations
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence
from sqlalchemy.orm import selectinload

from app.repositories.maintenance_repository import MaintenanceRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.models.maintenance_rule import MaintenanceRule
from app.models.service_record import ServiceRecord
from app.core.events import MaintenanceDue


class MaintenanceStatus:
    OK = "ok"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    DUE = "due"


class Priority:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class MaintenanceResult:
    service_type: str
    description: Optional[str] = None
    status: str = MaintenanceStatus.OK
    remaining_km: Optional[int] = None
    remaining_days: Optional[int] = None
    last_performed_km: Optional[int] = None
    last_performed_date: Optional[datetime] = None
    interval_km: Optional[int] = None
    interval_months: Optional[int] = None
    health_score: float = 100.0
    priority: str = Priority.LOW
    is_due: bool = False
    estimated_cost: Optional[float] = None


@dataclass
class VehicleHealthReport:
    vehicle_id: str
    customer_id: str
    overall_score: float
    items: List[MaintenanceResult]
    urgent_count: int = 0
    due_soon_count: int = 0


class MaintenanceService:
    """Calculates maintenance schedules, due items, and health scores.
    Does NOT publish events directly — the caller is responsible for that.
    """

    def __init__(self, session, service_center_id):
        self.service_center_id = service_center_id
        self.maintenance_repo = MaintenanceRepository(session, service_center_id)
        self.vehicle_repo = VehicleRepository(session, service_center_id)
        self.service_record_repo = ServiceRecordRepository(session, service_center_id)

    async def calculate_due_services(self, vehicle_id: uuid.UUID) -> VehicleHealthReport:
        vehicle = await self._get_vehicle_with_relations(vehicle_id)
        if not vehicle:
            return VehicleHealthReport(
                vehicle_id=str(vehicle_id), customer_id="", overall_score=0, items=[]
            )

        rules = await self.maintenance_repo.rules_for_model(
            brand_id=vehicle.vehicle_model.brand_id,
            vehicle_model_id=vehicle.vehicle_model_id,
            service_center_id=vehicle.service_center_id,
        )

        last_services = await self.service_record_repo.find_by_vehicle(vehicle_id)
        last_service_map = self._build_latest_service_map(last_services)

        results: List[MaintenanceResult] = []
        total_health = 0.0

        for rule in rules:
            result = self._evaluate_rule(rule, vehicle, last_service_map.get(rule.service_type))
            results.append(result)
            total_health += result.health_score

        overall = round(total_health / max(len(results), 1), 1)

        urgent = sum(1 for r in results if r.priority == Priority.HIGH)
        due_soon = sum(1 for r in results if r.status == MaintenanceStatus.DUE_SOON)

        return VehicleHealthReport(
            vehicle_id=str(vehicle_id),
            customer_id=str(vehicle.customer_id),
            overall_score=overall,
            items=results,
            urgent_count=urgent,
            due_soon_count=due_soon,
        )

    async def _get_vehicle_with_relations(self, vehicle_id: uuid.UUID) -> Optional[Vehicle]:
        """Get vehicle with eagerly loaded vehicle_model and brand, using the same session as repos."""
        from sqlalchemy import select as sa_select
        stmt = sa_select(Vehicle).options(
            selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand)
        ).where(
            Vehicle.id == vehicle_id,
            Vehicle.service_center_id == self.service_center_id,  # tenant-scoped
            Vehicle.is_active == True,
        )
        result = await self.vehicle_repo.session.execute(stmt)
        return result.scalar_one_or_none()

    def _build_latest_service_map(self, services: Sequence[ServiceRecord]) -> dict:
        """Build a map of service_type -> most recent ServiceRecord."""
        result = {}
        for s in services:
            if s.service_type not in result:
                result[s.service_type] = s
        return result

    def _evaluate_rule(
        self,
        rule: MaintenanceRule,
        vehicle: Vehicle,
        last_service: Optional[ServiceRecord],
    ) -> MaintenanceResult:
        result = MaintenanceResult(
            service_type=rule.service_type,
            description=rule.description,
            interval_km=rule.interval_km,
            interval_months=rule.interval_months,
            estimated_cost=rule.estimated_cost,
        )

        km_remaining: Optional[int] = None
        days_remaining: Optional[int] = None

        if rule.interval_km and last_service:
            km_remaining = rule.interval_km - (vehicle.current_km - last_service.performed_km)
            result.last_performed_km = last_service.performed_km
        elif rule.interval_km and not last_service:
            km_remaining = rule.interval_km - vehicle.current_km

        if rule.interval_months and last_service:
            days_since = (datetime.now(timezone.utc) - last_service.performed_date).days
            days_remaining = (rule.interval_months * 30) - days_since
            result.last_performed_date = last_service.performed_date

        result.remaining_km = km_remaining
        result.remaining_days = days_remaining

        km_due = km_remaining is not None and km_remaining <= 0
        time_due = days_remaining is not None and days_remaining <= 0
        km_due_soon = km_remaining is not None and 0 < km_remaining <= 1000
        time_due_soon = days_remaining is not None and 0 < days_remaining <= 14

        if km_due or time_due:
            result.status = MaintenanceStatus.OVERDUE if (km_remaining is not None and km_remaining < -500) else MaintenanceStatus.DUE
            result.is_due = True
            result.priority = Priority.HIGH
            result.health_score = self._calc_health_from_km(km_remaining, rule.interval_km)
        elif km_due_soon or time_due_soon:
            result.status = MaintenanceStatus.DUE_SOON
            result.is_due = True
            result.priority = Priority.MEDIUM
            result.health_score = self._calc_health_from_km(km_remaining, rule.interval_km)
        else:
            result.status = MaintenanceStatus.OK
            result.priority = Priority.LOW
            if km_remaining is not None and rule.interval_km:
                result.health_score = round((km_remaining / rule.interval_km) * 100, 1)
            elif days_remaining is not None and rule.interval_months:
                result.health_score = round((days_remaining / (rule.interval_months * 30)) * 100, 1)

        result.health_score = max(0, min(100, result.health_score))
        return result

    def _calc_health_from_km(self, km_remaining: Optional[int], interval_km: Optional[int]) -> float:
        if km_remaining is None or not interval_km:
            return 20.0
        return max(0, min(100, (km_remaining / interval_km) * 100))

    async def get_health_score(self, vehicle_id: uuid.UUID) -> float:
        report = await self.calculate_due_services(vehicle_id)
        return report.overall_score

    def get_due_events(self, report: VehicleHealthReport) -> List[MaintenanceDue]:
        """Return MaintenanceDue events for items that need attention.
        The caller should add these to the Unit of Work."""
        events = []
        for item in report.items:
            if item.is_due:
                events.append(MaintenanceDue(
                    aggregate_id=uuid.UUID(report.vehicle_id),
                    vehicle_id=uuid.UUID(report.vehicle_id),
                    customer_id=uuid.UUID(report.customer_id),
                    service_type=item.service_type,
                    due_km=item.remaining_km,
                    service_center_id=self.service_center_id,
                ))
        return events
