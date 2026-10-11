"""Operations Center — the case lifecycle service.

One service for every case type. Each transition mutates the case and emits a
domain event; the notification engine turns those into the bell feed + the
case/customer/vehicle timelines (timeline as source of truth — nothing is
appended by hand).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.sql import quoted_name

from app.core.events import CaseAssigned, CaseOpened, CaseResolved, CaseStatusChanged
from app.exceptions import GarageException, NotFoundError, ValidationError
from app.models.brand import Brand
from app.models.customer import Customer
from app.models.notification import Notification
from app.models.operational_case import CaseStatus, CaseType, OPEN_CASE_STATUSES, OperationalCase
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.tenant_references import local_reference, local_reference_exists
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.user_repository import UserRepository
from app.services.maintenance_service import MaintenanceService
from app.services.vehicle_health_service import _band, _vehicle_label, format_vehicle_label

_TYPE_SLA = {  # first-response SLA minutes by type
    CaseType.EMERGENCY: 15, CaseType.TOWING: 20, CaseType.VIP: 30,
    CaseType.SUPPORT: 120, CaseType.WARRANTY: 480,
}


class CaseNotFound(NotFoundError):
    detail = "Operational case or reference not found"


class CaseVehicleOwnerMismatch(ValidationError):
    detail = "Vehicle does not belong to the selected customer"


class CaseSearchUnavailable(GarageException):
    status_code = 503
    code = "CASE_SEARCH_UNAVAILABLE"
    detail = "Case search is temporarily unavailable"


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

    def _safe_where(self):
        # Current eligibility belongs to writes, not to historical reads.
        return (
            OperationalCase.service_center_id == self.sc,
            OperationalCase.is_active.is_(True),
            local_reference_exists(Customer, OperationalCase.customer_id, self.sc),
            or_(OperationalCase.vehicle_id.is_(None),
                local_reference_exists(Vehicle, OperationalCase.vehicle_id, self.sc)),
            or_(OperationalCase.assigned_user_id.is_(None),
                local_reference_exists(User, OperationalCase.assigned_user_id, self.sc)),
        )

    async def get_record(self, case_id: uuid.UUID, *, for_update: bool = False) -> OperationalCase:
        """Validate a case before any case entry point reads or mutates it."""
        statement = select(OperationalCase).where(OperationalCase.id == case_id, *self._safe_where())
        if for_update:
            statement = statement.with_for_update(of=OperationalCase)
        row = await self.session.execute(statement)
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
        customer = await local_reference(self.session, Customer, customer_id, self.sc, active=True)
        if customer is None:
            raise CaseNotFound()
        if vehicle_id is not None:
            vehicle = await local_reference(self.session, Vehicle, vehicle_id, self.sc, active=True)
            if vehicle is None:
                raise CaseNotFound()
            if vehicle.customer_id != customer_id:
                raise CaseVehicleOwnerMismatch()
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
        case = await self.get_record(case_id)
        mechanic = await UserRepository(self.session).mechanic(self.sc, user_id)
        if mechanic is None:
            raise CaseNotFound()
        case.assigned_user_id = user_id
        if case.status in (CaseStatus.NEW, CaseStatus.ACKNOWLEDGED):
            case.status = CaseStatus.ASSIGNED
        await self.session.flush()
        self.uow.add_event(CaseAssigned(
            service_center_id=self.sc, case_id=case.id, code=case.code,
            mechanic_name=mechanic.full_name if mechanic else None,
            customer_id=case.customer_id, vehicle_id=case.vehicle_id,
        ))
        return await self.serialize(case)

    async def set_status(self, case_id: uuid.UUID, status: str) -> dict:
        case = await self.get_record(case_id)
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

    async def list_mechanics(self) -> list:
        users = await UserRepository(self.session).mechanics(self.sc)
        return [
            {"id": str(u.id), "name": u.full_name}
            for u in users
        ]

    # ── read ──────────────────────────────────────────────────
    async def list_cases(
        self, *, status_group: str | None = None, case_type: str | None = None,
        customer_id: uuid.UUID | None = None, q: str | None = None, limit: int = 60, offset: int = 0,
    ) -> dict:
        # Scalar joins avoid Customer/Vehicle selectin collections on list reads.
        stmt = select(OperationalCase).join(Customer, and_(
            Customer.id == OperationalCase.customer_id, Customer.service_center_id == self.sc,
        )).where(*self._safe_where())
        if customer_id is not None:
            stmt = stmt.where(OperationalCase.customer_id == customer_id)
        if case_type and case_type != "all":
            stmt = stmt.where(OperationalCase.case_type == case_type)
        if status_group == "active":
            stmt = stmt.where(OperationalCase.status.notin_([CaseStatus.RESOLVED, CaseStatus.CLOSED]))
        elif status_group == "resolved":
            stmt = stmt.where(OperationalCase.status.in_([CaseStatus.RESOLVED, CaseStatus.CLOSED]))
        query = (q or "").strip()
        if query:
            await self._require_search_collation()
            pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            # Fixed trusted identifier, explicitly schema-qualified; q stays bound data.
            collation = quoted_name('pg_catalog."und-x-icu"', quote=False)
            stmt = stmt.where(or_(*[
                field.collate(collation).ilike(pattern, escape="\\")
                for field in (OperationalCase.code, OperationalCase.title, Customer.full_name)
            ]))
        totals = (await self.session.execute(stmt.with_only_columns(
            func.count(), func.count().filter(OperationalCase.status.in_(OPEN_CASE_STATUSES)),
            maintain_column_froms=True,
        ))).one()
        page = stmt.add_columns(Customer.full_name, Vehicle.id, Brand.name, VehicleModel.name, Vehicle.license_plate).outerjoin(
            Vehicle, and_(Vehicle.id == OperationalCase.vehicle_id, Vehicle.service_center_id == self.sc, Vehicle.is_active.is_(True)),
        ).outerjoin(VehicleModel, VehicleModel.id == Vehicle.vehicle_model_id).outerjoin(
            Brand, Brand.id == VehicleModel.brand_id,
        ).order_by(OperationalCase.created_at.desc(), OperationalCase.id.desc()).limit(limit).offset(offset)
        items = []
        for case, name, vehicle_id, brand, model, plate in (await self.session.execute(page)).all():
            item = self._fields(case)
            item["customer_name"] = name
            if case.vehicle_id:
                item["vehicle_label"] = format_vehicle_label(brand, model, plate) if vehicle_id else None
            items.append(item)
        return {
            "items": items, "active_count": totals[1], "total": totals[0],
            "limit": limit, "offset": offset,
        }

    async def _require_search_collation(self) -> None:
        available = await self.session.scalar(text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_collation c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace
                JOIN pg_catalog.pg_database d ON d.datname = current_database()
                WHERE n.nspname = 'pg_catalog' AND c.collname = 'und-x-icu'
                  AND c.collprovider = 'i' AND c.collisdeterministic
                  AND c.collencoding IN (-1, d.encoding)
                  AND pg_catalog.to_regcollation('pg_catalog."und-x-icu"') = c.oid
            )
        """))
        if not available:
            raise CaseSearchUnavailable()

    async def get_case(self, case_id: uuid.UUID) -> dict:
        case = await self.get_record(case_id)
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

    @staticmethod
    def _fields(case: OperationalCase) -> dict:
        elapsed = int((datetime.now(timezone.utc) - _utc(case.created_at)).total_seconds())
        sla_seconds = case.sla_response_minutes * 60
        return {
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

    async def serialize(self, case: OperationalCase, full: bool = False) -> dict:
        out = self._fields(case)
        if full:
            customer = await local_reference(self.session, Customer, case.customer_id, self.sc)
            out["customer"] = {
                "id": str(customer.id), "name": customer.full_name, "phone": customer.phone,
                "email": customer.email,
            } if customer else None
            if case.assigned_user_id:
                mech = await local_reference(self.session, User, case.assigned_user_id, self.sc)
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
            customer = await local_reference(self.session, Customer, case.customer_id, self.sc)
            out["customer_name"] = customer.full_name if customer else None
            if case.vehicle_id:
                vehicle = await self.maintenance.vehicle_repo.get_with_model(case.vehicle_id)
                out["vehicle_label"] = _vehicle_label(vehicle) if vehicle else None
        return out


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
