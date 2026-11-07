from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.exceptions import GarageException, VehicleNotFound, AppointmentNotFound
from app.models.appointment import Appointment
from app.models.customer import Customer
from app.models.inspection import (
    VehicleInspection,
    InspectionItem,
    InspectionStatus,
    InspectionRating,
    InspectionDecision,
    InspectionCategory,
    generate_dvi_token,
)
from app.models.invoice import Invoice, InvoiceLineItem, LineKind
from app.models.vehicle import Vehicle
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.inspection import (
    CustomerItemDecision,
    InspectionCreate,
    InspectionItemCreate,
    InspectionItemUpdate,
    InspectionResponse,
    InspectionSummary,
)

logger = logging.getLogger(__name__)

# Standard 16-point vehicle inspection template
DEFAULT_INSPECTION_CHECKLIST = [
    # Engine & Fluids
    (InspectionCategory.ENGINE_FLUIDS, "Dvigatel moyi darajasi va sifati", 1),
    (InspectionCategory.ENGINE_FLUIDS, "Sovutish suyuqligi (Antifriz)", 2),
    (InspectionCategory.ENGINE_FLUIDS, "Tormoz suyuqligi darajasi", 3),
    (InspectionCategory.ENGINE_FLUIDS, "Havo va salon filtrlari", 4),
    # Brakes
    (InspectionCategory.BRAKES, "Old tormoz kolodkalari va disklari", 5),
    (InspectionCategory.BRAKES, "Orqa tormoz kolodkalari va disklari", 6),
    (InspectionCategory.BRAKES, "Tormoz shlanglari va germetikligi", 7),
    # Tires & Wheels
    (InspectionCategory.TIRES_WHEELS, "Old shinalar protektori va bosimi", 8),
    (InspectionCategory.TIRES_WHEELS, "Orqa shinalar protektori va bosimi", 9),
    # Suspension & Steering
    (InspectionCategory.SUSPENSION_STEERING, "Old va orqa amortizatorlar", 10),
    (InspectionCategory.SUSPENSION_STEERING, "Sharavoy tayanchlar va saylentbloklar", 11),
    (InspectionCategory.SUSPENSION_STEERING, "Rul boshqaruvi va tyagalari", 12),
    # Battery & Electrical
    (InspectionCategory.BATTERY_ELECTRICAL, "Akkumulyator quvvati va terminallari", 13),
    (InspectionCategory.BATTERY_ELECTRICAL, "Tashqi chiroqlar va faralar", 14),
    (InspectionCategory.BATTERY_ELECTRICAL, "Generator zaryadi", 15),
    # Body & Glass
    (InspectionCategory.BODY_GLASS, "Oyna tozalagichlar (dvorniklar)", 16),
]


class InspectionNotFound(GarageException):
    status_code = 404
    detail = "Texnik ko'rik topilmadi."


class InspectionService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.repo = InspectionRepository(uow.session, uow.service_center_id)

    def _calculate_overall_score(self, items: list[InspectionItem]) -> int:
        """Derive 0-100 overall score from item traffic light ratings."""
        if not items:
            return 100
        score_weights = {
            InspectionRating.GREEN: 100,
            InspectionRating.YELLOW: 60,
            InspectionRating.RED: 20,
        }
        total = sum(score_weights.get(item.rating, 100) for item in items)
        return int(round(total / len(items)))

    def _build_summary(self, items: list[InspectionItem]) -> InspectionSummary:
        """Compute aggregated counts and financial metrics."""
        summary = InspectionSummary()
        summary.total_items = len(items)
        for it in items:
            if it.rating == InspectionRating.GREEN:
                summary.green_count += 1
            elif it.rating == InspectionRating.YELLOW:
                summary.yellow_count += 1
            elif it.rating == InspectionRating.RED:
                summary.red_count += 1

            est_total = it.estimated_labor_price + it.estimated_parts_price
            summary.total_estimated_amount += est_total
            if it.customer_decision == InspectionDecision.APPROVED:
                summary.approved_amount += est_total
        return summary

    async def create_inspection(
        self,
        vehicle_id: uuid.UUID,
        customer_id: Optional[uuid.UUID] = None,
        appointment_id: Optional[uuid.UUID] = None,
        inspector_id: Optional[uuid.UUID] = None,
        title: str = "Kompleks texnik ko'rik (DVI)",
        summary_notes: Optional[str] = None,
        mileage_at_inspection: Optional[int] = None,
        items: Optional[List[InspectionItemCreate]] = None,
    ) -> VehicleInspection:
        """Create a new multi-point digital vehicle inspection."""
        # Validate vehicle exists in tenant
        vehicle = await self.uow.session.scalar(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.service_center_id == self.uow.service_center_id,
                Vehicle.is_active == True,
            )
        )
        if not vehicle:
            raise VehicleNotFound(vehicle_id)

        # Infer customer if not provided
        if customer_id is None and vehicle.customer_id is not None:
            customer_id = vehicle.customer_id

        # Infer mileage if not provided
        if mileage_at_inspection is None and vehicle.mileage is not None:
            mileage_at_inspection = vehicle.mileage

        token = generate_dvi_token()
        inspection = VehicleInspection(
            service_center_id=self.uow.service_center_id,
            vehicle_id=vehicle_id,
            customer_id=customer_id,
            appointment_id=appointment_id,
            inspector_id=inspector_id,
            title=title,
            summary_notes=summary_notes,
            mileage_at_inspection=mileage_at_inspection,
            status=InspectionStatus.DRAFT,
            public_token=token,
            overall_score=100,
        )
        self.uow.session.add(inspection)
        await self.uow.session.flush()

        # Build items
        created_items: list[InspectionItem] = []
        if items:
            for it in items:
                item_row = InspectionItem(
                    service_center_id=self.uow.service_center_id,
                    inspection_id=inspection.id,
                    category=it.category,
                    title=it.title,
                    rating=it.rating,
                    notes=it.notes,
                    photos=it.photos or [],
                    estimated_labor_price=it.estimated_labor_price,
                    estimated_parts_price=it.estimated_parts_price,
                    sort_order=it.sort_order,
                )
                self.uow.session.add(item_row)
                created_items.append(item_row)
        else:
            # Populate standard 16-point checklist
            for category, item_title, sort_order in DEFAULT_INSPECTION_CHECKLIST:
                item_row = InspectionItem(
                    service_center_id=self.uow.service_center_id,
                    inspection_id=inspection.id,
                    category=category,
                    title=item_title,
                    rating=InspectionRating.GREEN,
                    notes=None,
                    photos=[],
                    estimated_labor_price=Decimal("0"),
                    estimated_parts_price=Decimal("0"),
                    sort_order=sort_order,
                )
                self.uow.session.add(item_row)
                created_items.append(item_row)

        await self.uow.session.flush()
        inspection.overall_score = self._calculate_overall_score(created_items)
        await self.uow.session.flush()
        return await self.repo.get_with_items(inspection.id)

    async def get_inspection(self, inspection_id: uuid.UUID) -> VehicleInspection:
        """Fetch tenant-scoped inspection with items."""
        inspection = await self.repo.get_with_items(inspection_id)
        if not inspection:
            raise InspectionNotFound(inspection_id)
        return inspection

    async def update_item(
        self,
        inspection_id: uuid.UUID,
        item_id: uuid.UUID,
        payload: InspectionItemUpdate,
    ) -> InspectionItem:
        """Update inspection item rating, notes, photos, or prices."""
        inspection = await self.get_inspection(inspection_id)
        item = await self.uow.session.scalar(
            select(InspectionItem).where(
                InspectionItem.id == item_id,
                InspectionItem.inspection_id == inspection_id,
                InspectionItem.service_center_id == self.uow.service_center_id,
            )
        )
        if not item:
            raise GarageException(detail="Ko'rik bandi topilmadi.", status_code=404)

        if payload.category is not None:
            item.category = payload.category
        if payload.title is not None:
            item.title = payload.title
        if payload.rating is not None:
            item.rating = payload.rating
        if payload.notes is not None:
            item.notes = payload.notes
        if payload.photos is not None:
            item.photos = payload.photos
        if payload.estimated_labor_price is not None:
            item.estimated_labor_price = payload.estimated_labor_price
        if payload.estimated_parts_price is not None:
            item.estimated_parts_price = payload.estimated_parts_price
        if payload.customer_decision is not None:
            item.customer_decision = payload.customer_decision
        if payload.customer_comment is not None:
            item.customer_comment = payload.customer_comment
        if payload.sort_order is not None:
            item.sort_order = payload.sort_order

        await self.uow.session.flush()
        # Recalculate inspection overall score
        inspection.overall_score = self._calculate_overall_score(inspection.items)
        return item

    async def send_to_customer(self, inspection_id: uuid.UUID) -> str:
        """Mark inspection as sent to customer and return public link."""
        inspection = await self.get_inspection(inspection_id)
        inspection.status = InspectionStatus.SENT
        return f"/inspection/{inspection.public_token}"

    @staticmethod
    async def get_public_inspection(session, token: str) -> Optional[VehicleInspection]:
        """Fetch inspection publicly by unguessable token."""
        return await InspectionRepository.get_by_token_global(session, token)

    async def submit_customer_decisions(
        self,
        token: str,
        decisions: List[CustomerItemDecision],
    ) -> VehicleInspection:
        """Customer approves or declines items via public token.

        Approved items with estimates automatically bridge into the
        appointment's open invoice/estimate if linked.
        """
        inspection = await self.repo.get_by_token_global(self.uow.session, token)
        if not inspection:
            raise InspectionNotFound(detail="Ko'rik havolasi yaroqsiz yoki topilmadi.")

        item_map = {it.id: it for it in inspection.items}
        approved_items: list[InspectionItem] = []

        for d in decisions:
            item = item_map.get(d.item_id)
            if item:
                item.customer_decision = d.decision
                if d.comment:
                    item.customer_comment = d.comment
                if d.decision == InspectionDecision.APPROVED:
                    approved_items.append(item)

        # Update inspection status based on decisions
        total_decided = sum(1 for it in inspection.items if it.customer_decision != InspectionDecision.PENDING)
        total_approved = sum(1 for it in inspection.items if it.customer_decision == InspectionDecision.APPROVED)
        total_declined = sum(1 for it in inspection.items if it.customer_decision == InspectionDecision.DECLINED)

        if total_approved > 0 and total_declined == 0:
            inspection.status = InspectionStatus.APPROVED
        elif total_approved > 0 and total_declined > 0:
            inspection.status = InspectionStatus.PARTIALLY_APPROVED
        elif total_declined > 0 and total_approved == 0:
            inspection.status = InspectionStatus.DECLINED

        # Bridge approved items to active invoice if linked to appointment
        if approved_items and inspection.appointment_id:
            invoice = await self.uow.session.scalar(
                select(Invoice).where(
                    Invoice.appointment_id == inspection.appointment_id,
                    Invoice.service_center_id == inspection.service_center_id,
                    Invoice.is_active == True,
                ).options(selectinload(Invoice.line_items))
            )
            if invoice:
                existing_titles = {li.description for li in invoice.line_items}
                max_sort = max([li.sort_order for li in invoice.line_items], default=0)

                for app_item in approved_items:
                    # Add parts line item if price > 0
                    if app_item.estimated_parts_price > 0:
                        part_desc = f"{app_item.title} (Ehtiyot qism)"
                        if part_desc not in existing_titles:
                            max_sort += 1
                            li_part = InvoiceLineItem(
                                service_center_id=inspection.service_center_id,
                                invoice_id=invoice.id,
                                kind=LineKind.PART,
                                description=part_desc,
                                quantity=Decimal("1"),
                                unit_price=app_item.estimated_parts_price,
                                line_total=app_item.estimated_parts_price,
                                sort_order=max_sort,
                            )
                            self.uow.session.add(li_part)

                    # Add labor line item if price > 0
                    if app_item.estimated_labor_price > 0:
                        labor_desc = f"{app_item.title} (O'rnatish / Ta'mirlash)"
                        if labor_desc not in existing_titles:
                            max_sort += 1
                            li_labor = InvoiceLineItem(
                                service_center_id=inspection.service_center_id,
                                invoice_id=invoice.id,
                                kind=LineKind.LABOR,
                                description=labor_desc,
                                quantity=Decimal("1"),
                                unit_price=app_item.estimated_labor_price,
                                line_total=app_item.estimated_labor_price,
                                sort_order=max_sort,
                            )
                            self.uow.session.add(li_labor)

                # Recompute invoice totals
                await self.uow.session.flush()
                subtotal = sum(li.line_total for li in invoice.line_items)
                invoice.subtotal = subtotal
                invoice.total = subtotal  # simple calculation without tax

        await self.uow.session.flush()
        return inspection

    async def list_inspections(
        self,
        vehicle_id: Optional[uuid.UUID] = None,
        appointment_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[VehicleInspection]:
        """List tenant inspections with optional filtering."""
        stmt = select(VehicleInspection).where(
            VehicleInspection.service_center_id == self.uow.service_center_id,
            VehicleInspection.is_active == True,
        )
        if vehicle_id:
            stmt = stmt.where(VehicleInspection.vehicle_id == vehicle_id)
        if appointment_id:
            stmt = stmt.where(VehicleInspection.appointment_id == appointment_id)

        stmt = stmt.options(
            selectinload(VehicleInspection.items),
            selectinload(VehicleInspection.vehicle),
            selectinload(VehicleInspection.customer),
        ).order_by(VehicleInspection.created_at.desc()).offset(offset).limit(limit)

        res = await self.uow.session.execute(stmt)
        return res.scalars().all()

    async def delete_inspection(self, inspection_id: uuid.UUID) -> bool:
        """Soft-delete an inspection."""
        inspection = await self.get_inspection(inspection_id)
        inspection.is_active = False
        await self.uow.session.flush()
        return True

    def to_response_dto(self, inspection: VehicleInspection) -> InspectionResponse:
        """Convert ORM model to Pydantic InspectionResponse."""
        summary = self._build_summary(inspection.items)
        resp = InspectionResponse.model_validate(inspection)
        resp.summary = summary
        resp.public_url = f"/inspection/{inspection.public_token}"
        return resp

    @staticmethod
    def serialize_public_dvi(inspection: VehicleInspection) -> dict:
        """Format an inspection for customer-facing public display."""
        vehicle = getattr(inspection, "vehicle", None)
        make_name = ""
        model_name = ""
        try:
            if vehicle is not None and hasattr(vehicle, "vehicle_model"):
                vm = vehicle.vehicle_model
                if vm is not None:
                    model_name = getattr(vm, "name", "")
                    brand = getattr(vm, "brand", None)
                    if brand is not None:
                        make_name = getattr(brand, "name", "")
        except Exception:
            pass

        sc = getattr(inspection, "service_center", None)
        sc_name = "GarageOS Servis Markazi"
        sc_phone = None
        sc_address = None
        try:
            if sc is not None:
                sc_name = getattr(sc, "name", sc_name) or sc_name
                sc_phone = getattr(sc, "phone", None)
                sc_address = getattr(sc, "address", None)
        except Exception:
            pass

        items_list = list(inspection.items or [])
        summary = {
            "total_items": len(items_list),
            "green_count": sum(1 for it in items_list if it.rating == InspectionRating.GREEN),
            "yellow_count": sum(1 for it in items_list if it.rating == InspectionRating.YELLOW),
            "red_count": sum(1 for it in items_list if it.rating == InspectionRating.RED),
            "total_estimated_amount": float(
                sum((it.estimated_labor_price or 0) + (it.estimated_parts_price or 0) for it in items_list)
            ),
            "approved_amount": float(
                sum(
                    (it.estimated_labor_price or 0) + (it.estimated_parts_price or 0)
                    for it in items_list
                    if it.customer_decision == InspectionDecision.APPROVED
                )
            ),
        }

        return {
            "id": str(inspection.id),
            "public_token": inspection.public_token,
            "title": inspection.title,
            "status": inspection.status,
            "summary_notes": inspection.summary_notes,
            "mileage_at_inspection": inspection.mileage_at_inspection,
            "overall_score": inspection.overall_score,
            "created_at": inspection.created_at.isoformat() if inspection.created_at else None,
            "vehicle": {
                "id": str(vehicle.id) if vehicle else None,
                "make": make_name,
                "model": model_name,
                "year": getattr(vehicle, "year", None),
                "license_plate": getattr(vehicle, "license_plate", ""),
                "vin": getattr(vehicle, "vin", None),
            } if vehicle else None,
            "service_center": {
                "name": sc_name,
                "phone": sc_phone,
                "address": sc_address,
            },
            "summary": summary,
            "items": [
                {
                    "id": str(it.id),
                    "category": it.category,
                    "title": it.title,
                    "rating": it.rating,
                    "notes": it.notes,
                    "photos": it.photos or [],
                    "estimated_labor_price": float(it.estimated_labor_price or 0),
                    "estimated_parts_price": float(it.estimated_parts_price or 0),
                    "total_price": float((it.estimated_labor_price or 0) + (it.estimated_parts_price or 0)),
                    "customer_decision": it.customer_decision,
                    "customer_comment": it.customer_comment,
                    "sort_order": it.sort_order,
                }
                for it in sorted(items_list, key=lambda x: x.sort_order)
            ],
        }
