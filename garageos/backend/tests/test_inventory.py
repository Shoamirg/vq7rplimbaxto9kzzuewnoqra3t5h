"""Unit & Service tests for Inventory and Parts Management.

Tests part creation, SKU uniqueness, stock adjustments, invoice auto-deduction,
and summary KPI calculations.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.exceptions import ValidationError
from app.models.invoice import Invoice, InvoiceKind, InvoiceLineItem, InvoiceStatus, LineKind
from app.models.part import MovementType, PartCategory, PartItem, InventoryMovement
from app.models.service_center import ServiceCenter
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.part import PartCreate, PartUpdate, StockAdjustmentRequest
from app.services.inventory_service import InventoryService, PartNotFound, SkuAlreadyExists


async def _setup_center(session):
    tag = uuid.uuid4().hex[:8]
    center = ServiceCenter(name=f"GarageOS Center {tag}", email=f"center-{tag}@test.local")
    session.add(center)
    await session.flush()
    return center


@pytest.mark.asyncio
async def test_create_part_and_initial_movement():
    async with UnitOfWork() as uow:
        center = await _setup_center(uow.session)
        uow.service_center_id = center.id
        service = InventoryService(uow)

        payload = PartCreate(
            name="Castrol Magnatec 5W-40 4L",
            sku="OIL-CAS-5W40",
            oem_number="CAS-5W40-4L",
            barcode="4008177071676",
            category=PartCategory.OILS_FLUIDS,
            unit="dona",
            cost_price=Decimal("280000.00"),
            retail_price=Decimal("350000.00"),
            quantity_in_stock=Decimal("15"),
            min_stock_level=Decimal("5"),
            location="A-01",
            supplier_name="Castrol Direct",
        )
        part = await service.create_part(payload)
        await uow.commit()

        assert part.id is not None
        assert part.sku == "OIL-CAS-5W40"
        assert part.quantity_in_stock == Decimal("15")

        # Verify initial movement logged
        dto = service.to_response_dto(part)
        assert dto.is_low_stock is False
        assert dto.profit_margin == Decimal("70000.00")
        assert dto.profit_margin_percent == 25.0

        movements = await service.list_movements(part_id=part.id)
        assert len(movements) == 1
        assert movements[0].movement_type == MovementType.PURCHASE
        assert movements[0].quantity == Decimal("15")


@pytest.mark.asyncio
async def test_duplicate_sku_raises_conflict():
    async with UnitOfWork() as uow:
        center = await _setup_center(uow.session)
        uow.service_center_id = center.id
        service = InventoryService(uow)

        payload = PartCreate(
            name="Spark Plug NGK",
            sku="PLUG-NGK-01",
            category=PartCategory.IGNITION_ELECTRICAL,
        )
        await service.create_part(payload)
        await uow.commit()

        # Second create with same SKU should raise SkuAlreadyExists
        with pytest.raises(SkuAlreadyExists):
            await service.create_part(payload)


@pytest.mark.asyncio
async def test_stock_adjustment_and_validation():
    async with UnitOfWork() as uow:
        center = await _setup_center(uow.session)
        uow.service_center_id = center.id
        service = InventoryService(uow)

        part = await service.create_part(
            PartCreate(
                name="Brake Pads Cobalt",
                sku="PAD-COB-01",
                quantity_in_stock=Decimal("10"),
                min_stock_level=Decimal("3"),
                cost_price=Decimal("120000.00"),
                retail_price=Decimal("180000.00"),
            )
        )
        await uow.commit()

        # Receive 5 more
        adj_in = StockAdjustmentRequest(
            movement_type=MovementType.PURCHASE,
            quantity=Decimal("5"),
            notes="Yangi partiya keldi",
        )
        updated = await service.adjust_stock(part.id, adj_in)
        assert updated.quantity_in_stock == Decimal("15")

        # Write off 2 as loss
        adj_loss = StockAdjustmentRequest(
            movement_type=MovementType.LOSS,
            quantity=Decimal("2"),
            notes="Qutisi singan",
        )
        updated = await service.adjust_stock(part.id, adj_loss)
        assert updated.quantity_in_stock == Decimal("13")

        # Attempt to subtract more than stock raises ValidationError
        adj_excessive = StockAdjustmentRequest(
            movement_type=MovementType.SALE,
            quantity=Decimal("50"),
        )
        with pytest.raises(ValidationError):
            await service.adjust_stock(part.id, adj_excessive)


@pytest.mark.asyncio
async def test_invoice_deduct_and_summary():
    async with UnitOfWork() as uow:
        center = await _setup_center(uow.session)
        uow.service_center_id = center.id
        service = InventoryService(uow)

        p1 = await service.create_part(
            PartCreate(
                name="Oil Filter Mann",
                sku="FLT-OIL-01",
                category=PartCategory.FILTERS,
                quantity_in_stock=Decimal("20"),
                min_stock_level=Decimal("5"),
                cost_price=Decimal("40000.00"),
                retail_price=Decimal("65000.00"),
            )
        )
        p2 = await service.create_part(
            PartCreate(
                name="Air Filter Mann",
                sku="FLT-AIR-01",
                category=PartCategory.FILTERS,
                quantity_in_stock=Decimal("2"),  # Low stock
                min_stock_level=Decimal("5"),
                cost_price=Decimal("50000.00"),
                retail_price=Decimal("80000.00"),
            )
        )
        await uow.commit()

        # Summary check
        summary = await service.get_summary()
        assert summary.total_parts == 2
        assert summary.total_stock_count == Decimal("22")
        # cost: 20 * 40000 + 2 * 50000 = 800000 + 100000 = 900000
        assert summary.total_cost_value == Decimal("900000.00")
        assert summary.low_stock_count == 1  # p2 is low stock

        # Simulate invoice deduction
        class MockLineItem:
            def __init__(self, part_id, quantity):
                self.part_id = part_id
                self.quantity = quantity

        mock_items = [MockLineItem(p1.id, Decimal("3"))]
        await service.deduct_for_invoice_items(uuid.uuid4(), mock_items)
        await uow.commit()

        reloaded_p1 = await service.get_part(p1.id)
        assert reloaded_p1.quantity_in_stock == Decimal("17")
