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

        # --- Check 3: tenant-scoped repository returns only its tenant --------
        print("\nCheck 3 — CustomerRepository(tenant=A).list() returns only A")
        repo_a = CustomerRepository(session, a.id)
        items, total = await repo_a.list(limit=1000)
        leaked = [c.id for c in items if c.service_center_id != a.id]
        ok &= _line(
            PASS if not leaked else FAIL,
            f"returned {len(items)} rows (reported total={total}), foreign-tenant rows={len(leaked)}",
        )

        # --- Check 4: get_by_id() can no longer cross tenants (IDOR closed) ----
        print("\nCheck 4 — get_by_id() cannot cross tenants (IDOR closed)")
        b_customer = (
            await session.execute(
                select(Customer).where(Customer.service_center_id == b.id).limit(1)
            )
        ).scalar_one()
        fetched = await repo_a.get_by_id(b_customer.id)
        ok &= _line(
            PASS if fetched is None else FAIL,
            f"A-scoped get_by_id(B_customer_id) -> {'None (blocked)' if fetched is None else 'LEAKED B ROW'}",
        )
        a_customer_id = (
            await session.execute(
                select(Customer.id).where(Customer.service_center_id == a.id).limit(1)
            )
        ).scalar_one()
        own = await repo_a.get_by_id(a_customer_id)
        ok &= _line(PASS if own is not None else FAIL, "A-scoped get_by_id(A_customer_id) still works")

    await engine.dispose()
    print(f"\n=== Isolation verification: {'ALL DATA CHECKS PASSED' if ok else 'FAILURES PRESENT'} ===\n")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
