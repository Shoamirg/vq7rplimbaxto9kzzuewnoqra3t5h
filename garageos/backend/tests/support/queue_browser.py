"""Owned legacy queue records; browser_release guards the isolated database."""
import uuid
from datetime import datetime, timezone

from app.models import Appointment, Brand, Customer, Vehicle, VehicleModel


async def create_queue_profiles(session, issuers):
    brand = Brand(name="QA33 Chinor & Очень длинное сохранённое название производителя")
    session.add(brand)
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Model <literal> & Узун сақланган автомобил номи — 33")
    session.add(model)
    await session.flush()
    profiles = []
    for index, issuer in enumerate(issuers):
        center = uuid.UUID(issuer["center_id"])
        customer = Customer(service_center_id=center, full_name=f"QA33 legacy {index} <literal> & Клиент")
        session.add(customer)
        await session.flush()
        vehicle = Vehicle(service_center_id=center, customer_id=customer.id, vehicle_model_id=model.id,
                          year=2024, license_plate=f"QA33LEGACY{index}", is_active=False)
        session.add(vehicle)
        await session.flush()
        appointment = Appointment(service_center_id=center, customer_id=customer.id, vehicle_id=vehicle.id,
                                  appointment_date=datetime(2037, 3, 1, tzinfo=timezone.utc),
                                  appointment_time="07:00", status="rescheduled", estimated_duration_minutes=0,
                                  mechanic_name="QA old mechanic <literal> & Шерзод")
        session.add(appointment)
        await session.flush()
        profiles.append(dict(center_id=str(center), model_id=str(model.id),
                             vehicle_label=f"{brand.name} {model.name}", legacy_id=str(appointment.id),
                             legacy_name=customer.full_name, legacy_customer_id=str(customer.id)))
    await session.commit()
    return profiles
