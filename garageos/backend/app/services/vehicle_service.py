from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.unit_of_work import UnitOfWork
from app.models.brand import Brand
from app.models.customer import Customer
from app.models.vehicle_model import VehicleModel
from app.services.maintenance_service import MaintenanceService
from app.core.events import VehicleAdded, MileageUpdated, event_bus
from app.exceptions import CustomerNotFound, DuplicateVehicle, VehicleNotFound, BrandNotFound


class VehicleService:
    """Manages vehicles and triggers maintenance calculations on mileage updates."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.maintenance_service = MaintenanceService(uow.session, sc)

    async def add_vehicle(self, customer_id: uuid.UUID, data: dict) -> dict:
        customer_id = uuid.UUID(str(customer_id))
        customer = await self.uow.session.scalar(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.service_center_id == self.uow.service_center_id,
                Customer.is_active == True,
            )
        )
        if customer is None:
            raise CustomerNotFound()

        model_id = uuid.UUID(str(data["vehicle_model_id"]))
        brand_id = uuid.UUID(str(data["brand_id"]))
        model = await self.uow.session.scalar(
            select(VehicleModel)
            .where(
                VehicleModel.id == model_id,
                VehicleModel.brand_id == brand_id,
                VehicleModel.is_active == True,
            )
            .options(selectinload(VehicleModel.brand))
        )
        if model is None or model.brand is None or not model.brand.is_active:
            raise BrandNotFound()

        vin = data.get("vin")
        if vin and await self.vehicle_repo.find_by_vin(vin):
            raise DuplicateVehicle()

        vehicle = await self.vehicle_repo.create(
            customer_id=customer_id,
            service_center_id=data["service_center_id"],
            vehicle_model_id=model_id,
            year=data["year"],
            license_plate=data.get("license_plate"),
            vin=data.get("vin"),
            engine_type=data.get("engine_type"),
            transmission=data.get("transmission"),
            color=data.get("color"),
            current_km=data.get("current_km", 0),
            notes=data.get("notes"),
        )

        self.uow.add_event(VehicleAdded(
            aggregate_id=vehicle.id,
            vehicle_id=vehicle.id,
            customer_id=customer_id,
            brand=model.brand.name,
            model=model.name,
        ))

        return {
            "id": str(vehicle.id),
            "customer_id": str(vehicle.customer_id),
            "vehicle_model_id": str(vehicle.vehicle_model_id),
            "year": vehicle.year,
            "current_km": vehicle.current_km,
        }

    async def list_catalog(self) -> list[dict]:
        result = await self.uow.session.execute(
            select(Brand)
            .where(Brand.is_active == True)
            .options(selectinload(Brand.vehicle_models))
            .order_by(Brand.name)
        )
        brands = result.scalars().unique().all()
        catalog = []
        for brand in brands:
            models = sorted(
                (model for model in brand.vehicle_models if model.is_active),
                key=lambda model: model.name.casefold(),
            )
            if models:
                catalog.append({
                    "id": str(brand.id),
                    "name": brand.name,
                    "models": [{"id": str(model.id), "name": model.name} for model in models],
                })
        return catalog

    async def update_mileage(self, vehicle_id: uuid.UUID, new_km: int) -> dict:
        vehicle = await self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle:
            raise VehicleNotFound(vehicle_id)

        old_km = vehicle.current_km
        vehicle = await self.vehicle_repo.update_mileage(vehicle_id, new_km)
        if not vehicle:
            raise VehicleNotFound(vehicle_id)

        self.uow.add_event(MileageUpdated(
            aggregate_id=vehicle_id,
            vehicle_id=vehicle_id,
            previous_km=old_km,
            new_km=new_km,
        ))

        # Trigger maintenance calculation and collect events for the UoW
        report = await self.maintenance_service.calculate_due_services(vehicle_id)
        for event in self.maintenance_service.get_due_events(report):
            self.uow.add_event(event)

        return {
            "id": str(vehicle.id),
            "previous_km": old_km,
            "current_km": new_km,
            "due_services": [
                {
                    "service_type": item.service_type,
                    "status": item.status,
                    "remaining_km": item.remaining_km,
                }
                for item in report.items if item.is_due
            ],
        }

    async def get_vehicles_for_customer(self, customer_id: uuid.UUID) -> Sequence:
        vehicles = await self.vehicle_repo.find_by_customer(customer_id)
        return [
            {
                "id": str(v.id),
                "brand": v.vehicle_model.brand.name if v.vehicle_model and v.vehicle_model.brand else "",
                "model": v.vehicle_model.name if v.vehicle_model else "",
                "year": v.year,
                "license_plate": v.license_plate,
                "vin": v.vin,
                "current_km": v.current_km,
                "is_active": v.is_active,
            }
            for v in vehicles
        ]

    async def get_vehicle_by_id(self, vehicle_id: uuid.UUID) -> Optional[dict]:
        vehicle = await self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle:
            return None
        return {
            "id": str(vehicle.id),
            "customer_id": str(vehicle.customer_id),
            "brand": vehicle.vehicle_model.brand.name if vehicle.vehicle_model and vehicle.vehicle_model.brand else "",
            "model": vehicle.vehicle_model.name if vehicle.vehicle_model else "",
            "year": vehicle.year,
            "license_plate": vehicle.license_plate,
            "vin": vehicle.vin,
            "current_km": vehicle.current_km,
            "color": vehicle.color,
            "engine_type": vehicle.engine_type,
            "transmission": vehicle.transmission,
            "is_active": vehicle.is_active,
        }
