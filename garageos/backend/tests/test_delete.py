"""Delete/archive guarantees.

Delete is a tenant-scoped soft-delete (sets is_active=False → hidden from lists,
recoverable in the DB). These pin the two properties that matter: it archives
rather than destroys, and it can never touch another tenant's rows.
"""
from __future__ import annotations

import uuid

from app.models import Customer, ServiceCenter
from app.repositories.customer_repository import CustomerRepository


async def _center(session, name: str) -> ServiceCenter:
    center = ServiceCenter(name=name, email=f"{name}-{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    return center


async def test_soft_delete_archives(session):
    center = await _center(session, "A")
    cust = Customer(service_center_id=center.id, full_name="Archive Me")
    session.add(cust)
    await session.flush()

    repo = CustomerRepository(session, center.id)
    assert await repo.delete(cust.id) is True
    assert cust.is_active is False              # archived, not destroyed
    assert await repo.get_by_id(cust.id) is None  # hidden from tenant reads


async def test_delete_cannot_cross_tenants(session):
    a = await _center(session, "A")
    b = await _center(session, "B")
    cust_b = Customer(service_center_id=b.id, full_name="Belongs to B")
    session.add(cust_b)
    await session.flush()

    repo_a = CustomerRepository(session, a.id)
    assert await repo_a.delete(cust_b.id) is False   # not found → no-op
    assert cust_b.is_active is True                  # untouched


async def test_hard_delete_removes_row(session):
    center = await _center(session, "A")
    cust = Customer(service_center_id=center.id, full_name="Gone For Good")
    session.add(cust)
    await session.flush()
    cust_id = cust.id

    repo = CustomerRepository(session, center.id)
    assert await repo.delete(cust_id, hard=True) is True
    assert await repo.get_by_id(cust_id) is None
