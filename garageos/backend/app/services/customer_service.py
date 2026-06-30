from __future__ import annotations
import uuid
from typing import Optional, Sequence

from app.repositories.customer_repository import CustomerRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.unit_of_work import UnitOfWork
from app.exceptions import CustomerNotFound


class CustomerService:
    """Manages customer lifecycle, loyalty, and timeline."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.customer_repo = CustomerRepository(uow.session)
        self.vehicle_repo = VehicleRepository(uow.session)
        self.appointment_repo = AppointmentRepository(uow.session)
        self.service_record_repo = ServiceRecordRepository(uow.session)

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
        service_center_id: uuid.UUID,
        query: str,
    ) -> Sequence:
        customers = await self.customer_repo.search(service_center_id, query)
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
        customer = await self.customer_repo.find_by_telegram_id(telegram_id)
        if not customer:
            return None
        return {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "service_center_id": str(customer.service_center_id),
            "loyalty_points": customer.loyalty_points,
        }
