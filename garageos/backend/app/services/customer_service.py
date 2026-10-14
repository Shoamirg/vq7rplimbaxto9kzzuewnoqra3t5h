from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from sqlalchemy import case, func, select, text
from sqlalchemy.orm import selectinload

from app.models.appointment import Appointment
from app.models.invoice import Invoice, InvoiceKind
from app.models.service_record import ServiceRecord
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.customer_repository import CustomerRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.unit_of_work import UnitOfWork
from app.exceptions import CustomerNotFound, ConflictError
from app.core.timezone import local_date_for_instant, service_center_timezone
from app.services.maintenance_service import MaintenanceService
from app.services.vehicle_health_service import _band, _passport_code, _vehicle_label

# Lifetime-spend tiers — honest, derived from real service-record totals.
_TIERS = [(8000, "Platinum", 5), (4000, "Gold", 4), (1500, "Silver", 3), (0, "Standard", 0)]


def _tier(lifetime_value: float) -> dict:
    for threshold, label, stars in _TIERS:
        if lifetime_value >= threshold:
            return {"label": label, "stars": stars}
    return {"label": "Standard", "stars": 0}


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class CustomerPhoneConflict(ConflictError):
    code = "DUPLICATE_CUSTOMER_PHONE"
    detail = "A customer with this phone already exists"


class CustomerService:
    """Manages customer lifecycle, loyalty, and timeline."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.sc = sc
        self.session = uow.session
        self.customer_repo = CustomerRepository(uow.session, sc)
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.appointment_repo = AppointmentRepository(uow.session, sc)
        self.service_record_repo = ServiceRecordRepository(uow.session, sc)
        self.maintenance = MaintenanceService(uow.session, sc)

    async def delete_customer(self, customer_id: uuid.UUID) -> None:
        """Soft-delete (archive) a customer — hidden from lists, recoverable in DB.
        Tenant-scoped: another tenant's id is simply not found."""
        ok = await self.customer_repo.delete(customer_id)
        if not ok:
            raise CustomerNotFound()
        from app.services.auth_session_service import AuthSessionService
        await AuthSessionService(self.session).revoke_principal("customer", customer_id)
        await self.uow.flush()

    async def register_customer(self, data) -> dict:
        digits = "".join(c for c in data.phone if c.isdigit())
        # Serialize identical phone registrations within this tenant, including
        # simultaneous button clicks, without blocking other service centers.
        await self.session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                                   {"key": f"customer:{self.sc}:{digits}"})
        if await self.customer_repo.find_by_normalized_phone(digits):
            raise CustomerPhoneConflict()
        customer = await self.customer_repo.create(**data.model_dump(), loyalty_points=0)
        return {"id": str(customer.id), "full_name": customer.full_name,
                "phone": customer.phone, "email": customer.email, "vehicle_count": 0,
                "lifetime_value": 0, "tier": "Standard", "last_visit": None}

    async def create_customer(
        self,
        service_center_id: uuid.UUID,
        full_name: str,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        telegram_id: Optional[int] = None,
        telegram_username: Optional[str] = None,
        address: Optional[str] = None,
    ) -> dict:
        customer = await self.customer_repo.create(
            service_center_id=service_center_id,
            full_name=full_name,
            phone=phone,
            email=email,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            address=address,
            loyalty_points=0,
        )
        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "email": customer.email,
            "telegram_id": customer.telegram_id,
        }

    async def get_customer(self, customer_id: uuid.UUID) -> Optional[dict]:
        customer = await self.customer_repo.find_with_vehicles(customer_id)
        if not customer:
            return None

        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "email": customer.email,
            "telegram_username": customer.telegram_username,
            "loyalty_points": customer.loyalty_points,
            "address": customer.address,
            "is_active": customer.is_active,
            "vehicle_count": len(customer.vehicles) if customer.vehicles else 0,
            "vehicles": [
                {
                    "id": str(v.id),
                    "brand": v.vehicle_model.brand.name if v.vehicle_model and v.vehicle_model.brand else "",
                    "model": v.vehicle_model.name if v.vehicle_model else "",
                    "year": v.year,
                    "license_plate": v.license_plate,
                    "current_km": v.current_km,
                    "health_score": None,
                }
                for v in (customer.vehicles or [])
            ],
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
        }

    async def update_customer(
        self,
        customer_id: uuid.UUID,
        full_name: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        address: Optional[str] = None,
    ) -> dict:
        customer = await self.customer_repo.update(
            customer_id,
            full_name=full_name,
            phone=phone,
            email=email,
            address=address,
        )
        if not customer:
            raise CustomerNotFound()

        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "email": customer.email,
        }

    async def add_loyalty_points(
        self,
        customer_id: uuid.UUID,
        points: int,
    ) -> dict:
        customer = await self.customer_repo.add_loyalty_points(customer_id, points)
        if not customer:
            raise CustomerNotFound()

        return {
            "id": str(customer_id),
            "loyalty_points": customer.loyalty_points,
            "points_added": points,
        }

    async def get_customer_timeline(
        self,
        customer_id: uuid.UUID,
    ) -> list:
        """Build a chronological timeline of customer activity."""
        timeline = []

        customer = await self.customer_repo.get_by_id(customer_id)
        if customer:
            timeline.append({
                "type": "customer_created",
                "title": "Customer Registered",
                "date": customer.created_at.isoformat(),
                "description": f"{customer.full_name} joined GarageOS",
            })

        vehicles = await self.vehicle_repo.find_by_customer(customer_id)
        for v in vehicles:
            timeline.append({
                "type": "vehicle_added",
                "title": f"Vehicle Added: {v.vehicle_model.brand.name if v.vehicle_model and v.vehicle_model.brand else ''} {v.vehicle_model.name if v.vehicle_model else ''}",
                "date": v.created_at.isoformat(),
                "vehicle_id": str(v.id),
                "description": f"Year: {v.year}, Plate: {v.license_plate or 'N/A'}",
            })

        appointments = await self.appointment_repo.find_by_customer(customer_id)
        zone_name = await service_center_timezone(self.session, self.sc)
        for a in appointments:
            status_label = a.status.replace("_", " ").title()
            timeline.append({
                "type": f"appointment_{a.status}",
                "title": f"Appointment {status_label}",
                "date": a.appointment_date.isoformat(),
                "appointment_id": str(a.id),
                "description": f"{a.service_type or 'Service'} at {a.appointment_time}",
            })

        service_records = await self.service_record_repo.find_by_customer(customer_id)
        for s in service_records:
            timeline.append({
                "type": "service_completed",
                "title": f"Service: {s.service_type}",
                "date": s.performed_date.isoformat(),
                "service_record_id": str(s.id),
                "description": f"Cost: ${s.cost:.2f}" if s.cost else s.service_type,
            })

        # Sort by date descending
        timeline.sort(key=lambda x: x["date"], reverse=True)
        return timeline

    async def search_customers(
        self,
        query: str,
    ) -> Sequence:
        customers = await self.customer_repo.search(query)
        return [
            {
                "id": str(c.id),
                "full_name": c.full_name,
                "phone": c.phone,
                "loyalty_points": c.loyalty_points,
                "vehicle_count": len(c.vehicles) if hasattr(c, "vehicles") and c.vehicles else 0,
            }
            for c in customers
        ]

    async def find_by_telegram(self, telegram_id: int) -> Optional[dict]:
        # Global identity lookup — establishes which tenant the customer is in.
        customer = await CustomerRepository.find_by_telegram_id(self.uow.session, telegram_id)
        if not customer:
            return None
        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "service_center_id": str(customer.service_center_id),
            "loyalty_points": customer.loyalty_points,
        }

    # ── Customer 360 ──────────────────────────────────────────
    async def list_360(self, query: str = "", limit: int = 50, offset: int = 0) -> dict:
        """List searchable customer summaries in stable alphabetical pages."""
        customers, total = await self.customer_repo.search_page(query.strip(), limit, offset)
        ids = [c.id for c in customers]
        spend = await self._spend_by_customer(ids)
        counts = await self._vehicle_counts(ids)
        last = await self._last_visit(ids)
        items = [
            {
                "id": str(c.id),
                "full_name": c.full_name,
                "phone": c.phone,
                "email": c.email,
                "vehicle_count": counts.get(c.id, 0),
                "lifetime_value": round(spend.get(c.id, {}).get("USD", 0.0), 2),
                "lifetime_value_by_currency": spend.get(c.id, {}),
                "tier": _tier(spend.get(c.id, {}).get("USD", 0.0))["label"],
                "last_visit": last.get(c.id).isoformat() if last.get(c.id) else None,
            }
            for c in customers
        ]
        return {"items": items, "count": len(items), "total": total,
                "offset": offset, "limit": limit, "has_more": offset + len(items) < total}

    async def get_360(self, customer_id: uuid.UUID) -> dict:
        """The command center for one customer."""
        customer = await self.customer_repo.find_with_vehicles(customer_id)
        if not customer:
            raise CustomerNotFound()
        center_name = await self._center_name()
        vehicles = await self._vehicles_with_models([v.id for v in (customer.vehicles or [])])

        vehicle_out: List[dict] = []
        scores: List[float] = []
        for v in vehicles:
            report = await self.maintenance.calculate_due_services(v.id)
            scores.append(report.overall_score)
            vehicle_out.append({
                "id": str(v.id),
                "label": _vehicle_label(v),
                "brand": v.vehicle_model.brand.name if v.vehicle_model and getattr(v.vehicle_model, "brand", None) else "",
                "model": v.vehicle_model.name if v.vehicle_model else "",
                "year": v.year,
                "license_plate": v.license_plate,
                "current_km": v.current_km,
                "score": report.overall_score,
                "band": _band(report.overall_score),
                "passport_code": _passport_code(center_name, v.id),
            })

        appointments = await self.appointment_repo.find_by_customer(customer_id)
        records = await self.service_record_repo.find_by_customer(customer_id)
        spend = await self._spend_by_customer([customer_id])
        lifetime_by_currency = spend.get(customer_id, {})
        lifetime_value = lifetime_by_currency.get("USD", 0.0)
        invoice_data = {appointment_id: {"currency": currency, "total": float(total)} for appointment_id, currency, total in (await self.session.execute(
            select(Invoice.appointment_id, Invoice.currency, Invoice.total).where(
                Invoice.service_center_id == self.sc, Invoice.customer_id == customer_id,
                Invoice.kind == InvoiceKind.INVOICE, Invoice.is_active.is_(True),
                Invoice.appointment_id.isnot(None)))).all()}

        now = datetime.now(timezone.utc)
        future = [a for a in appointments
                  if _as_utc(a.appointment_date) >= now and a.status not in ("cancelled", "completed")]
        next_booking = min(future, key=lambda a: a.appointment_date) if future else None
        # Last visit = the most recent completed touchpoint (service or a past
        # appointment), so it matches the list view's definition.
        visit_dates = [_as_utc(r.performed_date) for r in records]
        visit_dates += [_as_utc(a.appointment_date) for a in appointments
                        if _as_utc(a.appointment_date) <= now]
        last_visit = max(visit_dates) if visit_dates else None
        health_avg = round(sum(scores) / len(scores), 1) if scores else 0.0

        # Merge the event stream (bell notifications) into this customer's
        # timeline — one stream, another view.
        from app.services.notification_service import NotificationService
        timeline = self._build_timeline(records, appointments, invoice_data, zone_name)
        timeline += await NotificationService(self.uow).timeline_for(customer_id=customer_id)
        timeline.sort(key=lambda e: e["date"], reverse=True)
        timeline = timeline[:40]

        # Financial summary — Commercial Health, the money equivalent of Vehicle Health.
        from app.services.financial_service import FinancialService
        financial = await FinancialService(self.uow).customer_summary(customer_id)

        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "since": customer.created_at.isoformat() if customer.created_at else None,
            "has_telegram": customer.telegram_id is not None,
            "telegram_username": customer.telegram_username,
            "loyalty_points": customer.loyalty_points or 0,
            "tier": _tier(lifetime_value),
            "stats": {
                "vehicle_count": len(vehicles),
                "lifetime_value": lifetime_value,
                "lifetime_value_by_currency": lifetime_by_currency,
                "health_avg": health_avg,
                "health_band": _band(health_avg),
                "outstanding": financial["outstanding"],
                "outstanding_by_currency": {currency: totals["outstanding"] for currency, totals in financial["by_currency"].items()},
                "emergency_count": 0,       # emergency module not built yet
                "last_visit": last_visit.isoformat() if last_visit else None,
                "next_booking": next_booking.appointment_date.isoformat() if next_booking else None,
                "next_booking_local_date": local_date_for_instant(next_booking.appointment_date, zone_name).isoformat() if next_booking else None,
                "last_visit_local_date": local_date_for_instant(last_visit, zone_name).isoformat() if last_visit else None,
            },
            "financial": financial,
            "vehicles": vehicle_out,
            "appointments": [self._serialize_appt(a, invoice_data.get(a.id), zone_name) for a in
                             sorted(appointments, key=lambda a: a.appointment_date, reverse=True)[:12]],
            "timeline": timeline,
            "ai_summary": self._ai_summary(customer, vehicle_out, records, lifetime_value, next_booking),
        }

    async def _center_name(self) -> str:
        from app.models.service_center import ServiceCenter
        result = await self.session.execute(
            select(ServiceCenter.brand_name, ServiceCenter.name).where(ServiceCenter.id == self.sc)
        )
        row = result.first()
        return (row[0] or row[1]) if row else "GarageOS"

    async def _vehicles_with_models(self, ids: Sequence[uuid.UUID]) -> Sequence[Vehicle]:
        if not ids:
            return []
        stmt = select(Vehicle).where(Vehicle.id.in_(ids)).options(
            selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand)
        ).order_by(Vehicle.created_at.desc())
        return (await self.session.execute(stmt)).scalars().all()

    async def _spend_by_customer(self, ids: Sequence[uuid.UUID]) -> dict:
        if not ids:
            return {}
        currency = func.coalesce(Invoice.currency, "USD")
        # A linked invoice's amount and currency travel together. Applying its
        # currency to an older bare service cost would silently relabel money.
        amount = case((Invoice.id.isnot(None), Invoice.total), else_=ServiceRecord.cost)
        stmt = (
            select(Vehicle.customer_id, currency, func.coalesce(func.sum(amount), 0))
            .join(ServiceRecord, ServiceRecord.vehicle_id == Vehicle.id)
            .outerjoin(Invoice, (Invoice.appointment_id == ServiceRecord.appointment_id)
                       & (Invoice.kind == InvoiceKind.INVOICE) & Invoice.is_active.is_(True))
            .where(Vehicle.customer_id.in_(ids), Vehicle.service_center_id == self.sc)
            .group_by(Vehicle.customer_id, currency)
        )
        out: dict = {}
        for cid, currency, total in (await self.session.execute(stmt)).all():
            out.setdefault(cid, {})[currency] = round(float(total), 2)
        return out

    async def _vehicle_counts(self, ids: Sequence[uuid.UUID]) -> dict:
        if not ids:
            return {}
        stmt = (
            select(Vehicle.customer_id, func.count())
            .where(Vehicle.customer_id.in_(ids), Vehicle.service_center_id == self.sc,
                   Vehicle.is_active.is_(True))
            .group_by(Vehicle.customer_id)
        )
        return {cid: int(n) for cid, n in (await self.session.execute(stmt)).all()}

    async def _last_visit(self, ids: Sequence[uuid.UUID]) -> dict:
        if not ids:
            return {}
        now = datetime.now(timezone.utc)
        stmt = (
            select(Appointment.customer_id, func.max(Appointment.appointment_date))
            .where(Appointment.customer_id.in_(ids), Appointment.service_center_id == self.sc,
                   Appointment.appointment_date <= now)
            .group_by(Appointment.customer_id)
        )
        return {cid: dt for cid, dt in (await self.session.execute(stmt)).all()}

    def _serialize_appt(self, a: Appointment, invoice: dict | None = None, timezone_name: str = "UTC") -> dict:
        return {
            "id": str(a.id),
            "date": a.appointment_date.isoformat(),
            "local_date": local_date_for_instant(a.appointment_date, timezone_name).isoformat(),
            "time": a.appointment_time,
            "status": a.status,
            "mechanic_name": a.mechanic_name,
            "duration": a.estimated_duration_minutes,
            "vehicle_id": str(a.vehicle_id),
            "total_cost": invoice["total"] if invoice else a.total_cost,
            "currency": invoice["currency"] if invoice else "USD",
        }

    def _build_timeline(self, records: Sequence[ServiceRecord], appointments: Sequence[Appointment], invoices: dict | None = None, timezone_name: str = "UTC") -> list:
        events: List[dict] = []
        for r in records:
            invoice = (invoices or {}).get(r.appointment_id)
            events.append({
                "type": "service", "title": r.service_type,
                "date": r.performed_date.isoformat(), "detail": r.description,
                "cost": invoice["total"] if invoice else r.cost,
                "currency": invoice["currency"] if invoice else "USD",
            })
        for a in appointments:
            events.append({
                "type": f"appointment_{a.status}",
                "title": f"Appointment {a.status.replace('_', ' ').title()}",
                "date": a.appointment_date.isoformat(),
                "local_date": local_date_for_instant(a.appointment_date, timezone_name).isoformat(),
                "detail": a.mechanic_name,
            })
        events.sort(key=lambda e: e["date"], reverse=True)
        return events[:40]

    def _ai_summary(self, customer, vehicles, records, lifetime_value, next_booking) -> str:
        n = len(vehicles)
        since = customer.created_at.year if customer.created_at else None
        overdue = sum(1 for v in vehicles if v["band"] == "poor")
        first = customer.full_name.split()[0] if customer.full_name else "This customer"
        parts = [
            f"{first} has {n} vehicle{'s' if n != 1 else ''} on file"
            + (f" and has been a customer since {since}" if since else "")
            + f", with {len(records)} completed service{'s' if len(records) != 1 else ''}"
            + f" totalling ${round(lifetime_value):,}."
        ]
        parts.append(
            f"{overdue} vehicle{'s' if overdue != 1 else ''} currently need attention and should be booked in soon."
            if overdue else
            "All vehicles are currently in good standing with no overdue services."
        )
        parts.append(
            "There is an upcoming appointment already scheduled."
            if next_booking else
            "No upcoming appointment is on the books — a good candidate for a proactive reminder."
        )
        return " ".join(parts)
