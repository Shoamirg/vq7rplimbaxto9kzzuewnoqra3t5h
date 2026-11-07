"""Unit & Service integration tests for Digital Vehicle Inspection (DVI).

Tests checklist generation, scoring algorithms, item updates, public tokens,
customer decisions, and automated invoice line item bridging.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.appointment import Appointment, AppointmentStatus
from app.models.brand import Brand
from app.models.customer import Customer
from app.models.inspection import (
    InspectionCategory,
    InspectionDecision,
    InspectionRating,
    InspectionStatus,
    VehicleInspection,
)
from app.models.invoice import Invoice, InvoiceKind, LineKind
from app.models.service_center import ServiceCenter
from app.models.role import Role
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.inspection import CustomerItemDecision, InspectionItemUpdate
from app.services.inspection_service import InspectionNotFound, InspectionService


async def _setup_fixture(session):
    tag = uuid.uuid4().hex[:8]
    center = ServiceCenter(name=f"GarageOS Test {tag}", email=f"center-{tag}@test.local")
    session.add(center)
    await session.flush()

    brand = Brand(name=f"Brand-{tag}")
    session.add(brand)
    await session.flush()

    model = VehicleModel(brand_id=brand.id, name="Malibu", year_start=2020)
    session.add(model)
    await session.flush()

    customer = Customer(
        service_center_id=center.id,
        first_name="Alisher",
        last_name="Navoiy",
        phone=f"+99890{tag[:7]}",
    )
    session.add(customer)
    await session.flush()

    vehicle = Vehicle(
        service_center_id=center.id,
        customer_id=customer.id,
        vehicle_model_id=model.id,
        license_plate=f"01A{tag[:3].upper()}AA",
        year=2022,
        current_km=45000,
    )
    session.add(vehicle)
    await session.flush()

    role = Role(name="mechanic")
    session.add(role)
    await session.flush()

    mechanic = User(
        service_center_id=center.id,
        role_id=role.id,
        email=f"mech-{tag}@test.local",
        full_name="Jamshid Usta",
        password_hash="fakehash",
    )
    session.add(mechanic)
    await session.flush()

    return center, customer, vehicle, mechanic


@pytest.mark.asyncio
async def test_create_inspection_with_default_checklist(session):
    center, customer, vehicle, mechanic = await _setup_fixture(session)

    async with UnitOfWork(service_center_id=center.id) as uow:
        # Patch session to use test session
        uow.session = session
        service = InspectionService(uow)

        inspection = await service.create_inspection(
            vehicle_id=vehicle.id,
            customer_id=customer.id,
            inspector_id=mechanic.id,
            title="Bahorgi to'liq ko'rik",
            summary_notes="Muntazam texnik ko'rik",
        )

        assert inspection is not None
        assert inspection.id is not None
        assert inspection.overall_score == 100
        assert inspection.status == InspectionStatus.DRAFT
        assert inspection.public_token.startswith("dvi_")
        assert len(inspection.items) == 16
        assert all(it.rating == InspectionRating.GREEN for it in inspection.items)
        assert all(it.customer_decision == InspectionDecision.PENDING for it in inspection.items)


@pytest.mark.asyncio
async def test_score_calculation_and_item_update(session):
    center, customer, vehicle, mechanic = await _setup_fixture(session)

    async with UnitOfWork(service_center_id=center.id) as uow:
        uow.session = session
        service = InspectionService(uow)

        inspection = await service.create_inspection(
            vehicle_id=vehicle.id,
            customer_id=customer.id,
            inspector_id=mechanic.id,
        )

        # Update first item to RED with notes, photos, and estimated prices
        item1 = inspection.items[0]
        await service.update_item(
            inspection_id=inspection.id,
            item_id=item1.id,
            payload=InspectionItemUpdate(
                rating=InspectionRating.RED,
                notes="Tormoz kolodkasi 90% yeyilgan, zudlik bilan almashtirish kerak",
                photos=["https://garageos.uz/uploads/brake1.jpg"],
                estimated_parts_price=Decimal("350000.00"),
                estimated_labor_price=Decimal("150000.00"),
            ),
        )

        # Update second item to YELLOW
        item2 = inspection.items[1]
        await service.update_item(
            inspection_id=inspection.id,
            item_id=item2.id,
            payload=InspectionItemUpdate(
                rating=InspectionRating.YELLOW,
                notes="Antifriz darajasi past",
                estimated_parts_price=Decimal("80000.00"),
                estimated_labor_price=Decimal("30000.00"),
            ),
        )

        updated_inspection = await service.get_inspection(inspection.id)
        # Score calculation: 1 RED (20), 1 YELLOW (60), 14 GREEN (100)
        # Sum = 20 + 60 + 1400 = 1480 / 16 = 92.5 => 92 or 93
        assert updated_inspection.overall_score < 100
        assert updated_inspection.overall_score == 93

        summary = service._build_summary(updated_inspection.items)
        assert summary.red_count == 1
        assert summary.yellow_count == 1
        assert summary.green_count == 14
        assert summary.total_estimated_amount == Decimal("610000.00")
        assert summary.approved_amount == Decimal("0")


@pytest.mark.asyncio
async def test_public_view_and_customer_approval_bridging(session):
    center, customer, vehicle, mechanic = await _setup_fixture(session)

    # Create appointment and invoice
    appointment = Appointment(
        service_center_id=center.id,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        mechanic_user_id=mechanic.id,
        status=AppointmentStatus.IN_PROGRESS,
    )
    session.add(appointment)
    await session.flush()

    invoice = Invoice(
        service_center_id=center.id,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        appointment_id=appointment.id,
        kind=InvoiceKind.INVOICE,
        currency="UZS",
    )
    session.add(invoice)
    await session.flush()

    async with UnitOfWork(service_center_id=center.id) as uow:
        uow.session = session
        service = InspectionService(uow)

        inspection = await service.create_inspection(
            vehicle_id=vehicle.id,
            customer_id=customer.id,
            appointment_id=appointment.id,
            inspector_id=mechanic.id,
        )

        # Set items
        item_brake = inspection.items[0]
        await service.update_item(
            inspection_id=inspection.id,
            item_id=item_brake.id,
            payload=InspectionItemUpdate(
                title="Tormoz kolodkasi",
                rating=InspectionRating.RED,
                estimated_parts_price=Decimal("300000"),
                estimated_labor_price=Decimal("100000"),
            ),
        )

        item_filter = inspection.items[1]
        await service.update_item(
            inspection_id=inspection.id,
            item_id=item_filter.id,
            payload=InspectionItemUpdate(
                title="Salon filtri",
                rating=InspectionRating.YELLOW,
                estimated_parts_price=Decimal("80000"),
                estimated_labor_price=Decimal("20000"),
            ),
        )

        # Send to customer
        share_link = await service.send_to_customer(inspection.id)
        assert share_link == f"/inspection/{inspection.public_token}"

        # Fetch public inspection view
        public_data = InspectionService.serialize_public_dvi(
            await InspectionService.get_public_inspection(session, inspection.public_token)
        )
        assert public_data["public_token"] == inspection.public_token
        assert public_data["status"] == InspectionStatus.SENT
        assert len(public_data["items"]) == 16
        assert public_data["summary"]["red_count"] == 1
        assert public_data["summary"]["yellow_count"] == 1

        # Customer decides: APPROVE brake, DECLINE filter
        decisions = [
            CustomerItemDecision(item_id=item_brake.id, decision="approved", comment="Almashtiring, iltimos"),
            CustomerItemDecision(item_id=item_filter.id, decision="declined", comment="Keyingi safar"),
        ]

        decided_inspection = await service.submit_customer_decisions(inspection.public_token, decisions)
        assert decided_inspection.status == InspectionStatus.PARTIALLY_APPROVED

        # Verify automated bridging into invoice!
        await session.refresh(invoice, ["line_items"])
        assert len(invoice.line_items) == 2  # 1 part + 1 labor for approved item
        line_descriptions = [li.description for li in invoice.line_items]
        assert "Tormoz kolodkasi (Ehtiyot qism)" in line_descriptions
        assert "Tormoz kolodkasi (O'rnatish / Ta'mirlash)" in line_descriptions
        assert invoice.total == Decimal("400000.00")


@pytest.mark.asyncio
async def test_tenant_scoping_isolation(session):
    center1, customer1, vehicle1, mech1 = await _setup_fixture(session)
    center2, customer2, vehicle2, mech2 = await _setup_fixture(session)

    async with UnitOfWork(service_center_id=center1.id) as uow1:
        uow1.session = session
        service1 = InspectionService(uow1)
        insp1 = await service1.create_inspection(vehicle_id=vehicle1.id)

    async with UnitOfWork(service_center_id=center2.id) as uow2:
        uow2.session = session
        service2 = InspectionService(uow2)

        # Tenant 2 trying to read Tenant 1's inspection must raise 404
        with pytest.raises(InspectionNotFound):
            await service2.get_inspection(insp1.id)
