"""Unified global search — powers the Cmd/Ctrl+K command menu.

One query string, grouped results across the entities that exist today
(customers, vehicles, staff). Each group is small and tenant-scoped so the
palette stays instant. Appointments/invoices/conversations join as those
modules land.
"""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.models.brand import Brand
from app.models.customer import Customer
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.user_repository import UserRepository

_PER_GROUP = 6


class SearchService:
    def __init__(self, uow: UnitOfWork):
        self.session = uow.session
        self.sc = uow.service_center_id
        self.uow = uow

    async def search(self, query: str) -> dict:
        q = (query or "").strip()
        if len(q) < 1:
            return {"query": q, "customers": [], "vehicles": [], "mechanics": []}
        like = f"%{q}%"
        return {
            "query": q,
            "customers": await self._customers(like),
            "vehicles": await self._vehicles(like),
            "mechanics": await self._mechanics(q.lower()),
        }

    async def _customers(self, like: str) -> list:
        stmt = (
            select(Customer)
            .where(
                Customer.service_center_id == self.sc,
                Customer.is_active.is_(True),
                or_(
                    Customer.full_name.ilike(like),
                    Customer.phone.ilike(like),
                    Customer.email.ilike(like),
                ),
            )
            .limit(_PER_GROUP)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            {"id": str(c.id), "name": c.full_name, "phone": c.phone, "email": c.email}
            for c in rows
        ]

    async def _vehicles(self, like: str) -> list:
        stmt = (
            select(Vehicle)
            .join(VehicleModel, Vehicle.vehicle_model_id == VehicleModel.id)
            .join(Brand, VehicleModel.brand_id == Brand.id)
            .where(
                Vehicle.service_center_id == self.sc,
                Vehicle.is_active.is_(True),
                or_(
                    Vehicle.license_plate.ilike(like),
                    Vehicle.vin.ilike(like),
                    VehicleModel.name.ilike(like),
                    Brand.name.ilike(like),
                ),
            )
            .options(selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand))
            .limit(_PER_GROUP)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        out = []
        for v in rows:
            vm = v.vehicle_model
            brand = vm.brand.name if vm and getattr(vm, "brand", None) else ""
            model = vm.name if vm else ""
            out.append({
                "id": str(v.id),
                "label": f"{brand} {model}".strip(),
                "license_plate": v.license_plate,
                "year": v.year,
            })
        return out

    async def _mechanics(self, q_lower: str) -> list:
        users = await UserRepository(self.session).find_by_service_center(self.sc)
        return [
            {"id": str(u.id), "name": u.full_name, "role": u.role.name}
            for u in users
            if u.role and u.role.name == "mechanic" and q_lower in u.full_name.lower()
        ][:_PER_GROUP]
