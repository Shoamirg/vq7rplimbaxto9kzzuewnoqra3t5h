"""Verify multi-tenant data isolation on the seeded demo database.

Run:  python -m scripts.verify_tenant_isolation   (from backend/)

Checks:
  1. Data partition — each tenant table has rows for both tenants, no orphans.
  2. Cross-tenant FK integrity — no child row references a parent in another
     service center (vehicle->customer, appointment->customer/vehicle,
     service_record->vehicle).
  3. Repository filter (positive) — CustomerRepository.list(service_center_id=A)
     returns only tenant A rows.
  4. Repository leakage (negative) — get_by_id() is NOT tenant-scoped; this
     documents where isolation must be enforced by the service/API layer.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import func, select

from app.core.database import async_session_factory, engine
from app.models import (
    Appointment,
    Customer,
    ServiceCenter,
    ServiceRecord,
    Vehicle,
)
from app.repositories.customer_repository import CustomerRepository

PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"


def _line(status: str, msg: str) -> bool:
    icon = {PASS: "[PASS]", FAIL: "[FAIL]", WARN: "[WARN]"}[status]
    print(f"  {icon} {msg}")
    return status != FAIL


async def main() -> int:
    ok = True
    async with async_session_factory() as session:
        centers = (await session.execute(select(ServiceCenter).order_by(ServiceCenter.name))).scalars().all()
        if len(centers) < 2:
            print("Need at least 2 service centers seeded; run: python -m app.seeds.demo --fresh")
            return 1
        a, b = centers[0], centers[1]
        print(f"\nTenant A: {a.name} [{a.id}]")
        print(f"Tenant B: {b.name} [{b.id}]\n")

        # --- Check 1: partition ------------------------------------------------
        print("Check 1 — data partition per tenant")
        for model, label in [
            (Customer, "customers"),
            (Vehicle, "vehicles"),
            (Appointment, "appointments"),
            (ServiceRecord, "service_records"),
        ]:
            ca = await session.scalar(
                select(func.count()).select_from(model).where(model.service_center_id == a.id)
            )
            cb = await session.scalar(
                select(func.count()).select_from(model).where(model.service_center_id == b.id)
            )
            total = await session.scalar(select(func.count()).select_from(model))
            partitioned = (ca + cb) == total
            ok &= _line(
                PASS if (partitioned and ca and cb) else FAIL,
                f"{label:16} A={ca:<4} B={cb:<4} total={total:<4} (sum==total: {partitioned})",
            )

        # --- Check 2: cross-tenant FK integrity --------------------------------
        print("\nCheck 2 — cross-tenant foreign-key integrity (expect 0 violations)")

        veh_cust = await session.scalar(
            select(func.count())
            .select_from(Vehicle)
            .join(Customer, Vehicle.customer_id == Customer.id)
            .where(Vehicle.service_center_id != Customer.service_center_id)
        )
        ok &= _line(PASS if veh_cust == 0 else FAIL, f"vehicle.customer in same center     violations={veh_cust}")

        appt_cust = await session.scalar(
            select(func.count())
            .select_from(Appointment)
            .join(Customer, Appointment.customer_id == Customer.id)
            .where(Appointment.service_center_id != Customer.service_center_id)
        )
        ok &= _line(PASS if appt_cust == 0 else FAIL, f"appointment.customer same center    violations={appt_cust}")

        appt_veh = await session.scalar(
            select(func.count())
            .select_from(Appointment)
            .join(Vehicle, Appointment.vehicle_id == Vehicle.id)
            .where(Appointment.service_center_id != Vehicle.service_center_id)
        )
        ok &= _line(PASS if appt_veh == 0 else FAIL, f"appointment.vehicle same center     violations={appt_veh}")

        rec_veh = await session.scalar(
            select(func.count())
            .select_from(ServiceRecord)
            .join(Vehicle, ServiceRecord.vehicle_id == Vehicle.id)
            .where(ServiceRecord.service_center_id != Vehicle.service_center_id)
        )
        ok &= _line(PASS if rec_veh == 0 else FAIL, f"service_record.vehicle same center  violations={rec_veh}")

        # --- Check 3: repository filter (positive) -----------------------------
        print("\nCheck 3 — CustomerRepository.list(service_center_id=A) returns only A")
        repo = CustomerRepository(session)
        items, total = await repo.list(service_center_id=a.id, limit=1000)
        leaked = [c.id for c in items if c.service_center_id != a.id]
        ok &= _line(
            PASS if not leaked else FAIL,
            f"returned {len(items)} rows (reported total={total}), foreign-tenant rows={len(leaked)}",
        )

        # --- Check 4: repository leakage (negative / documented) ---------------
        print("\nCheck 4 — get_by_id() is NOT tenant-scoped (enforcement is caller's job)")
        b_customer = (
            await session.execute(
                select(Customer).where(Customer.service_center_id == b.id).limit(1)
            )
        ).scalar_one()
        fetched = await repo.get_by_id(b_customer.id)
        crossed = fetched is not None and fetched.service_center_id == b.id
        # This is expected with the current base repository. Surface as WARN so
        # it's a known, tracked gap for the API/service layer to close.
        _line(
            WARN if crossed else PASS,
            (
                "get_by_id(B_customer_id) fetched a Tenant-B row from an A-scoped "
                "call — service/API layer MUST verify service_center_id (IDOR risk)"
                if crossed
                else "get_by_id did not cross tenants"
            ),
        )
        # And the safe pattern proves isolation when the filter IS applied:
        safe_items, _ = await repo.list(service_center_id=a.id, limit=1000)
        safe = b_customer.id not in {c.id for c in safe_items}
        ok &= _line(PASS if safe else FAIL, "tenant-A list() correctly excludes the Tenant-B customer id")

    await engine.dispose()
    print(f"\n=== Isolation verification: {'ALL DATA CHECKS PASSED' if ok else 'FAILURES PRESENT'} ===\n")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
