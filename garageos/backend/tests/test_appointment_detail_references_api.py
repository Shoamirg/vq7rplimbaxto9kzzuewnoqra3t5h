"""Prepared normal-HTTP owning read contracts; no runtime result is claimed.

Corrupt only the isolated fixture's owned legacy FK rows after valid normal API
creation. Parent tenant scope alone must not expose another garage's labels.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, update

from app.core.database import async_session_factory
from app.models import Appointment, Customer, Vehicle
from tests.test_calendar_period_api import PrivateWorkshop, workshop  # noqa: F401
from tests.test_case_reference_safety_api import references  # noqa: F401
from tests.test_mechanic_work_api import workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


async def appointment_coordinates(identifier):
    async with async_session_factory() as session:
        row = await session.get(Appointment, identifier)
        assert row is not None
        return (row.service_center_id, row.customer_id, row.vehicle_id,
                row.maintenance_rule_id, row.mechanic_user_id, row.status,
                row.is_active, row.appointment_date, row.appointment_time,
                row.notes, row.customer_notes, row.total_cost)


@pytest.mark.parametrize("foreign_child", ["customer", "vehicle"])
async def test_owning_appointment_read_rejects_foreign_related_labels_without_rewriting_history(
    client, references, foreign_child,
):
    refs = references
    profile = await client.get("/api/v1/auth/me", headers=refs["admin"])
    assert profile.status_code == 200
    assert profile.json()["service_center_id"] == str(refs["center"])
    assert "staff.read" in profile.json()["permissions"]
    async with async_session_factory() as session:
        identifiers = (await session.scalars(select(Appointment.id).where(
            Appointment.service_center_id == refs["center"],
            Appointment.customer_id == uuid.UUID(refs["customer"]),
            Appointment.vehicle_id == uuid.UUID(refs["vehicle"]),
            Appointment.is_active.is_(True)))).all()
    assert len(identifiers) == 1
    identifier = identifiers[0]
    baseline = await client.get(f"/api/v1/appointments/{identifier}", headers=refs["admin"])
    assert baseline.status_code == 200
    assert baseline.json()["id"] == str(identifier)
    assert baseline.json()["customer_id"] == refs["customer"]
    assert baseline.json()["vehicle_id"] == refs["vehicle"]

    marker = "FD-" + uuid.uuid4().hex[:16]
    related_model = Customer if foreign_child == "customer" else Vehicle
    related_id = uuid.UUID(refs["foreign_" + foreign_child])
    async with async_session_factory() as session:
        related = await session.get(related_model, related_id)
        assert related is not None and related.service_center_id == refs["foreign_center"]
        if foreign_child == "customer":
            related.full_name = marker
        else:
            related.license_plate = marker
        await session.execute(update(Appointment).where(Appointment.id == identifier).values(
            **{foreign_child + "_id": related_id}))
        await session.commit()
    before = await appointment_coordinates(identifier)
    assert before[0] == refs["center"] and before[0] != refs["foreign_center"]
    assert before[1 if foreign_child == "customer" else 2] == related_id

    result = await client.get(f"/api/v1/appointments/{identifier}", headers=refs["admin"])
    # Test the boundary's response and label confidentiality independently.
    # No authentication dependency override or fabricated response is involved.
    assert marker not in result.text
    assert result.status_code == 404
    assert await appointment_coordinates(identifier) == before
    async with async_session_factory() as session:
        related = await session.get(related_model, related_id)
        assert related.service_center_id == refs["foreign_center"]
        assert getattr(related, "full_name" if foreign_child == "customer" else "license_plate") == marker
