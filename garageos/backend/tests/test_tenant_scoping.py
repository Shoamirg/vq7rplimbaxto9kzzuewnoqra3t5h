"""Tenant-scoping guarantees for the repository layer.

These lock in the IDOR fix: a repository bound to tenant A can never read or
mutate tenant B's rows, and construction without a tenant is impossible.
"""
from __future__ import annotations

import uuid

import pytest

from app.models import Customer, ServiceCenter
from app.repositories.customer_repository import CustomerRepository


async def _make_center(session, name: str) -> ServiceCenter:
    center = ServiceCenter(name=name, email=f"{name}-{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    return center


async def test_construction_requires_tenant():
    with pytest.raises(ValueError):
        CustomerRepository(None, None)


async def test_get_by_id_cannot_cross_tenants(session):
    a = await _make_center(session, "A")
    b = await _make_center(session, "B")
    cust_a = Customer(service_center_id=a.id, full_name="Cust A")
    cust_b = Customer(service_center_id=b.id, full_name="Cust B")
    session.add_all([cust_a, cust_b])
    await session.flush()

    repo_a = CustomerRepository(session, a.id)
    assert await repo_a.get_by_id(cust_b.id) is None          # blocked
    fetched = await repo_a.get_by_id(cust_a.id)
    assert fetched is not None and fetched.id == cust_a.id     # own tenant works


async def test_list_and_count_are_scoped(session):
    a = await _make_center(session, "A")
    b = await _make_center(session, "B")
    session.add_all([
        Customer(service_center_id=a.id, full_name="A1"),
        Customer(service_center_id=a.id, full_name="A2"),
        Customer(service_center_id=b.id, full_name="B1"),
    ])
    await session.flush()

    repo_a = CustomerRepository(session, a.id)
    items, total = await repo_a.list(limit=100)
    assert total == 2
    assert all(c.service_center_id == a.id for c in items)
    assert await repo_a.count() == 2


async def test_create_forces_owning_tenant(session):
    a = await _make_center(session, "A")
    b = await _make_center(session, "B")
    repo_a = CustomerRepository(session, a.id)
    # A caller-supplied foreign tenant must be overridden with the repo's tenant.
    created = await repo_a.create(full_name="X", service_center_id=b.id)
    assert created.service_center_id == a.id


async def test_update_and_delete_cannot_cross_tenants(session):
    a = await _make_center(session, "A")
    b = await _make_center(session, "B")
    cust_b = Customer(service_center_id=b.id, full_name="B only")
    session.add(cust_b)
    await session.flush()

    repo_a = CustomerRepository(session, a.id)
    assert await repo_a.update(cust_b.id, full_name="hacked") is None
    assert await repo_a.delete(cust_b.id) is False

    await session.refresh(cust_b)
    assert cust_b.full_name == "B only"
    assert cust_b.is_active is True
