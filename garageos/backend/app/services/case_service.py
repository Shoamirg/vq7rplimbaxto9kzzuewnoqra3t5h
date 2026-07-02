"""Operations Center — the case lifecycle service.

One service for every case type. Each transition mutates the case and emits a
domain event; the notification engine turns those into the bell feed + the
case/customer/vehicle timelines (timeline as source of truth — nothing is
appended by hand).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.core.events import CaseAssigned, CaseOpened, CaseResolved, CaseStatusChanged
from app.exceptions import NotFoundError
from app.models.customer import Customer
from app.models.notification import Notification
from app.models.operational_case import CaseStatus, CaseType, OperationalCase
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.maintenance_service import MaintenanceService
from app.services.vehicle_health_service import _band, _vehicle_label

_TYPE_SLA = {  # first-response SLA minutes by type
    CaseType.EMERGENCY: 15, CaseType.TOWING: 20, CaseType.VIP: 30,
    CaseType.SUPPORT: 120, CaseType.WARRANTY: 480,
}


class CaseNotFound(NotFoundError):
    def __init__(self):
        super().__init__("Operational case not found")


class CaseService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id
        self.maintenance = MaintenanceService(uow.session, self.sc)

    # ── code ──────────────────────────────────────────────────
    async def _next_code(self) -> str:
        year = datetime.now(timezone.utc).year
        n = await self.session.execute(
            select(func.count()).select_from(OperationalCase).where(
                OperationalCase.service_center_id == self.sc
            )
        )
        return f"OPS-{year}-{int(n.scalar_one()) + 1:06d}"

    async def _get(self, case_id: uuid.UUID) -> OperationalCase:
        row = await self.session.execute(
            select(OperationalCase).where(
                OperationalCase.id == case_id,
                OperationalCase.service_center_id == self.sc,
                OperationalCase.is_active.is_(True),
            )
        )
        case = row.scalar_one_or_none()
        if not case:
            raise CaseNotFound()
        return case

    # ── create ────────────────────────────────────────────────
    async def create_case(
        self, *, customer_id: uuid.UUID, title: str, case_type: str = CaseType.EMERGENCY,
        severity: str = "medium", description: str | None = None, channel: str | None = None,
        vehicle_id: uuid.UUID | None = None, location_text: str | None = None,
        location_lat: float | None = None, location_lng: float | None = None,
    ) -> dict:
        code = await self._next_code()
        case = OperationalCase(
            service_center_id=self.sc, code=code, case_type=case_type, status=CaseStatus.NEW,
            severity=severity, title=title, description=description, channel=channel,
            customer_id=customer_id, vehicle_id=vehicle_id, location_text=location_text,
            location_lat=location_lat, location_lng=location_lng,
            sla_response_minutes=_TYPE_SLA.get(case_type, 15),
        )
        self.session.add(case)
        await self.session.flush()
        self.uow.add_event(CaseOpened(
            service_center_id=self.sc, case_id=case.id, code=code, case_type=case_type,
            severity=severity, title=title, customer_id=customer_id, vehicle_id=vehicle_id,
        ))
        return await self.serialize(case)

    # ── transitions ───────────────────────────────────────────
    async def assign(self, case_id: uuid.UUID, user_id: uuid.UUID) -> dict:
        case = await self._get(case_id)
        case.assigned_user_id = user_id
        if case.status in (CaseStatus.NEW, CaseStatus.ACKNOWLEDGED):
            case.status = CaseStatus.ASSIGNED
        mechanic = await self.session.get(User, user_id)
        await self.session.flush()
        self.uow.add_event(CaseAssigned(
            service_center_id=self.sc, case_id=case.id, code=case.code,
            mechanic_name=mechanic.full_name if mechanic else None,
            customer_id=case.customer_id, vehicle_id=case.vehicle_id,
        ))
        return await self.serialize(case)

    async def set_status(self, case_id: uuid.UUID, status: str) -> dict:
        case = await self._get(case_id)
        case.status = status
        await self.session.flush()
        if status in (CaseStatus.RESOLVED, CaseStatus.CLOSED):
            self.uow.add_event(CaseResolved(
                service_center_id=self.sc, case_id=case.id, code=case.code,
                customer_id=case.customer_id, vehicle_id=case.vehicle_id,
            ))
        else:
            self.uow.add_event(CaseStatusChanged(
                service_center_id=self.sc, case_id=case.id, code=case.code, status=status,
                customer_id=case.customer_id, vehicle_id=case.vehicle_id,
            ))
        return await self.serialize(case)

    # ── read ──────────────────────────────────────────────────
    async def list_cases(self, *, status_group: str | None = None, case_type: str | None = None) -> dict:
        stmt = select(OperationalCase).where(
            OperationalCase.service_center_id == self.sc, OperationalCase.is_active.is_(True)
        )
        if case_type and case_type != "all":
            stmt = stmt.where(OperationalCase.case_type == case_type)
        if status_group == "active":
            stmt = stmt.where(OperationalCase.status.notin_([CaseStatus.RESOLVED, CaseStatus.CLOSED]))
        elif status_group == "resolved":
            stmt = stmt.where(OperationalCase.status.in_([CaseStatus.RESOLVED, CaseStatus.CLOSED]))
        stmt = stmt.order_by(OperationalCase.created_at.desc()).limit(60)
        rows = (await self.session.execute(stmt)).scalars().all()
        active = sum(1 for c in rows if c.is_open())
        return {
            "items": [await self.serialize(c) for c in rows],
            "active_count": active,
        }

    async def get_case(self, case_id: uuid.UUID) -> dict:
        case = await self._get(case_id)
        data = await self.serialize(case, full=True)
        data["timeline"] = await self._timeline(case_id)
        return data

    async def _timeline(self, case_id: uuid.UUID) -> list:
        rows = (await self.session.execute(
            select(Notification).where(
                Notification.service_center_id == self.sc,
                Notification.entity_type == "case",
                Notification.entity_id == case_id,
            ).order_by(Notification.created_at.desc()).limit(40)
        )).scalars().all()
        return [
            {"title": n.title, "detail": n.body, "date": n.created_at.isoformat(),
             "severity": n.severity, "category": n.category}
            for n in rows
        ]

    async def serialize(self, case: OperationalCase, full: bool = False) -> dict:
        elapsed = int((datetime.now(timezone.utc) - _utc(case.created_at)).total_seconds())
        sla_seconds = case.sla_response_minutes * 60
        out = {
            "id": str(case.id), "code": case.code, "case_type": case.case_type,
            "status": case.status, "severity": case.severity, "title": case.title,
            "description": case.description, "channel": case.channel,
            "customer_id": str(case.customer_id),
            "vehicle_id": str(case.vehicle_id) if case.vehicle_id else None,
            "assigned_user_id": str(case.assigned_user_id) if case.assigned_user_id else None,
            "location_text": case.location_text,
            "location_lat": case.location_lat, "location_lng": case.location_lng,
            "sla_response_minutes": case.sla_response_minutes,
            "elapsed_seconds": elapsed,
            "sla_breached": case.is_open() and elapsed > sla_seconds,
            "is_open": case.is_open(),
            "created_at": case.created_at.isoformat() if case.created_at else None,
        }
        if full:
            customer = await self.session.get(Customer, case.customer_id)
            out["customer"] = {
                "id": str(customer.id), "name": customer.full_name, "phone": customer.phone,
                "email": customer.email,
            } if customer else None
            if case.assigned_user_id:
                mech = await self.session.get(User, case.assigned_user_id)
                out["assigned_mechanic"] = mech.full_name if mech else None
            if case.vehicle_id:
                report = await self.maintenance.calculate_due_services(case.vehicle_id)
                vehicle = await self.maintenance.vehicle_repo.get_with_model(case.vehicle_id)
                out["vehicle"] = {
                    "id": str(case.vehicle_id),
                    "label": _vehicle_label(vehicle) if vehicle else None,
                    "score": report.overall_score, "band": _band(report.overall_score),
                }
        else:
            customer = await self.session.get(Customer, case.customer_id)
            out["customer_name"] = customer.full_name if customer else None
            if case.vehicle_id:
                vehicle = await self.maintenance.vehicle_repo.get_with_model(case.vehicle_id)
                out["vehicle_label"] = _vehicle_label(vehicle) if vehicle else None
        return out


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
