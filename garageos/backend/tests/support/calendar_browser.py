"""Owned test-only calendar contacts; caller guards and removes its QA database."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.models import Appointment, Customer, Vehicle, VehicleModel


async def create_calendar_profiles(session, issuer_profiles):
    model_id = await session.scalar(select(VehicleModel.id).order_by(VehicleModel.id).limit(1))
    if model_id is None:
        raise RuntimeError("Seed the isolated QA vehicle catalogue before calendar checks")
    profiles = []
    for index, issuer in enumerate(issuer_profiles):
        records = []
        for contacts in [True, False]:
            customer = Customer(service_center_id=uuid.UUID(issuer['center_id']),
                                full_name=f"QA navbat <Chinor> & Клиент {index}-{int(contacts)}",
                                phone="+998900000032" if contacts else None,
                                telegram_username="qa_calendar_contact" if contacts else None)
            session.add(customer)
            await session.flush()
            vehicle = Vehicle(service_center_id=customer.service_center_id, customer_id=customer.id,
                              vehicle_model_id=model_id, year=2024, license_plate=f"QA32-{index}-{int(contacts)}",
                              current_km=32000)
            session.add(vehicle)
            await session.flush()
            records.append(dict(customer_id=str(customer.id), vehicle_id=str(vehicle.id),
                                customer_name=customer.full_name, phone=customer.phone,
                                telegram_username=customer.telegram_username))
        rescheduled = {}
        for day in [3, 5, 7, 9, 11, 13]:
            date = f"2034-05-{day:02}"
            appointment = Appointment(service_center_id=uuid.UUID(issuer['center_id']),
                                      customer_id=uuid.UUID(records[1]['customer_id']),
                                      vehicle_id=uuid.UUID(records[1]['vehicle_id']),
                                      appointment_date=datetime(2034, 5, day, 7, tzinfo=timezone.utc),
                                      appointment_time="07:00", status="rescheduled",
                                      mechanic_name="QA eski usta <saqlangan>", estimated_duration_minutes=60)
            session.add(appointment)
            await session.flush()
            rescheduled[date] = str(appointment.id)
        profiles.append(dict(center_id=issuer['center_id'], contacts=records[0], absent=records[1], rescheduled=rescheduled))
    await session.commit()
    return profiles
