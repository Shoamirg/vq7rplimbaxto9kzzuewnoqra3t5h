"""Regression tests for work-order creation across auth and tenant DB sessions."""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.customer import Customer
from app.models.user import User
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.work_order import WorkOrderCreateRequest, WorkOrderUpdateRequest
from app.services.work_order_service import WorkOrderService


@pytest.mark.asyncio
async def test_create_work_order_with_actor_loaded_in_separate_auth_session(session):
    """The auth dependency and tenant UoW use different SQLAlchemy sessions."""
    auth_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    auth_session_factory = async_sessionmaker(auth_engine, expire_on_commit=False)
    try:
        async with auth_session_factory() as auth_session:
            actor = await auth_session.scalar(
                select(User).where(
                    User.email == "admin@demo.garageos.app",
                    User.is_active.is_(True),
                )
            )
            assert actor is not None, "demo staff account must be seeded for integration tests"

            vehicle = await session.scalar(
                select(Vehicle).join(Customer, Customer.id == Vehicle.customer_id).where(
                    Vehicle.service_center_id == actor.service_center_id,
                    Vehicle.is_active.is_(True),
                    Customer.is_active.is_(True),
                ).limit(1)
            )
            assert vehicle is not None, "demo vehicle must be seeded for integration tests"
            customer = await session.get(Customer, vehicle.customer_id)
            assert customer is not None, "the selected vehicle must have an active customer"

            uow = UnitOfWork(service_center_id=actor.service_center_id)
            uow.session = session
            result = await WorkOrderService(uow, actor).create_work_order(
                WorkOrderCreateRequest(
                    customer_id=customer.id,
                    vehicle_id=vehicle.id,
                    service_type="Separate-session integration check",
                    intake_odometer_km=vehicle.current_km,
                ),
                idempotency_key=str(uuid.uuid4()),
            )

            assert result["status"] == "received"
            assert result["created_by_user_id"] == str(actor.id)

            started = await WorkOrderService(uow, actor).update_work_order(
                uuid.UUID(result["id"]),
                WorkOrderUpdateRequest(status="in_progress"),
            )
            assert started["status"] == "in_progress"

            ready = await WorkOrderService(uow, actor).update_work_order(
                uuid.UUID(result["id"]),
                WorkOrderUpdateRequest(
                    status="ready",
                    work_performed="Completed a separate-session integration check",
                ),
            )
            assert ready["status"] == "ready"
            assert ready["service_record_id"] is not None
    finally:
        await auth_engine.dispose()
