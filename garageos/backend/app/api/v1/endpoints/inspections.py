"""Digital Vehicle Inspection (DVI) staff and mechanic endpoints.

Provides multi-point vehicle inspection workflows inspired by Shopmonkey,
allowing mechanics and service advisors to conduct traffic-light checklists,
attach photos and estimates, and generate public interactive approvals.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_inspection_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.inspection import (
    InspectionCreate,
    InspectionItemResponse,
    InspectionItemUpdate,
    InspectionResponse,
)
from app.services.inspection_service import InspectionService

router = APIRouter()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=InspectionResponse,
    summary="Create a new digital vehicle inspection",
)
async def create_inspection(
    payload: InspectionCreate,
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> InspectionResponse:
    service = InspectionService(uow)
    inspection = await service.create_inspection(
        vehicle_id=payload.vehicle_id,
        customer_id=payload.customer_id,
        appointment_id=payload.appointment_id,
        inspector_id=user.id,
        title=payload.title,
        summary_notes=payload.summary_notes,
        mileage_at_inspection=payload.mileage_at_inspection,
        items=payload.items,
    )
    return service.to_response_dto(inspection)


@router.get(
    "",
    summary="List digital vehicle inspections",
)
async def list_inspections(
    vehicle_id: Optional[uuid.UUID] = Query(None, description="Filter by vehicle ID"),
    appointment_id: Optional[uuid.UUID] = Query(None, description="Filter by appointment ID"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> dict:
    service = InspectionService(uow)
    rows = await service.list_inspections(
        vehicle_id=vehicle_id,
        appointment_id=appointment_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [service.to_response_dto(row) for row in rows],
        "total": len(rows),
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/{inspection_id}",
    response_model=InspectionResponse,
    summary="Get inspection details by ID",
)
async def get_inspection(
    inspection_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> InspectionResponse:
    service = InspectionService(uow)
    inspection = await service.get_inspection(inspection_id)
    return service.to_response_dto(inspection)


@router.patch(
    "/{inspection_id}/items/{item_id}",
    summary="Update inspection checklist item",
)
async def update_inspection_item(
    inspection_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: InspectionItemUpdate,
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> dict:
    service = InspectionService(uow)
    updated_item = await service.update_item(inspection_id, item_id, payload)
    inspection = await service.get_inspection(inspection_id)
    summary = service._build_summary(inspection.items)
    return {
        "item": InspectionItemResponse.model_validate(updated_item),
        "overall_score": inspection.overall_score,
        "summary": summary,
    }


@router.post(
    "/{inspection_id}/send",
    summary="Publish and generate shareable customer link for inspection",
)
async def send_inspection(
    inspection_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> dict:
    service = InspectionService(uow)
    public_url = await service.send_to_customer(inspection_id)
    inspection = await service.get_inspection(inspection_id)
    return {
        "status": inspection.status,
        "public_token": inspection.public_token,
        "public_url": public_url,
    }


@router.delete(
    "/{inspection_id}",
    summary="Delete inspection",
)
async def delete_inspection(
    inspection_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_inspection_uow),
) -> dict:
    service = InspectionService(uow)
    await service.delete_inspection(inspection_id)
    return {"success": True}
