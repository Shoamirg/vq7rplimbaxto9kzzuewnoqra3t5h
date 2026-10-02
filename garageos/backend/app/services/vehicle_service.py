from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import text

from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.brand_repository import BrandRepository
from app.repositories.vehicle_model_repository import VehicleModelRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.maintenance_service import MaintenanceService
from app.core.events import VehicleAdded, MileageUpdated, event_bus
from app.exceptions import VehicleNotFound, BrandNotFound, CustomerNotFound, ValidationError, DuplicateVehicle
from app.repositories.customer_repository import CustomerRepository


class VehicleModelUnknown(ValidationError):
    code = "UNKNOWN_VEHICLE_MODEL"
    detail = "Choose an active vehicle model"


class VehicleRegistrationConflict(DuplicateVehicle):
    code = "DUPLICATE_VEHICLE"
    detail = "A vehicle with this plate or VIN already exists"


class VehicleService:
    """Manages vehicles and triggers maintenance calculations on mileage updates."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.brand_repo = BrandRepository(uow.session)          # global reference
        self.model_repo = VehicleModelRepository(uow.session)   # global reference
        self.maintenance_service = MaintenanceService(uow.session, sc)

    async def register_vehicle(self, data) -> dict:
        customer = await CustomerRepository(self.uow.session, self.uow.service_center_id).get_by_id(data.customer_id)
        if not customer:
            raise CustomerNotFound()
        model = await self.model_repo.get_by_id(data.vehicle_model_id)
        if not model:
            raise VehicleModelUnknown()
        brand = await self.brand_repo.get_by_id(model.brand_id)
        if not brand:
            raise BrandNotFound()
        # Sort locks to make multi-identifier registrations deadlock-free.
        identifiers = sorted((field, value) for field, value in
                             (("vin", data.vin), ("license_plate", data.license_plate)) if value)
        for field, value in identifiers:
            await self.uow.session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                                           {"key": f"vehicle:{self.uow.service_center_id}:{field}:{value}"})
            if await self.vehicle_repo.find_by_identifier(field, value):
                raise VehicleRegistrationConflict()
        vehicle = await self.vehicle_repo.create(**data.model_dump())
        self.uow.add_event(VehicleAdded(aggregate_id=vehicle.id, vehicle_id=vehicle.id,
                                      customer_id=customer.id, brand=brand.name, model=model.name))
        return {"id": str(vehicle.id), "customer_id": str(customer.id), "brand": brand.name,
                "model": model.name,
                "label": f"{brand.name} {model.name}" + (f" ({vehicle.license_plate})" if vehicle.license_plate else ""),
                "year": vehicle.year,
                "license_plate": vehicle.license_plate, "current_km": vehicle.current_km}

    async def catalog(self) -> dict:
        brands = await self.brand_repo.list_active()
        return {"brands": [{"id": str(brand.id), "name": brand.name,
                            "models": [{"id": str(model.id), "name": model.name}
                                       for model in sorted(brand.vehicle_models, key=lambda m: m.name)
                                       if model.is_active]} for brand in brands]}

    async def add_vehicle(self, customer_id: uuid.UUID, data: dict) -> dict:
        vehicle = await self.vehicle_repo.create(
            customer_id=customer_id,
            service_center_id=data["service_center_id"],
            vehicle_model_id=uuid.UUID(data["vehicle_model_id"]),
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
            brand=data.get("brand", ""),
            model=data.get("model", ""),
        ))

        return {
            "id": str(vehicle.id),
            "customer_id": str(vehicle.customer_id),
            "vehicle_model_id": str(vehicle.vehicle_model_id),
            "year": vehicle.year,
            "current_km": vehicle.current_km,
        }

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
