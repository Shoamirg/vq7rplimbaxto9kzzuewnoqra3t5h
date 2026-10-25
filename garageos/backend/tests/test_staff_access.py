from types import SimpleNamespace

from app.core.staff_access import staff_permissions


def user(role_name: str, *, active: bool = True):
    return SimpleNamespace(role=SimpleNamespace(name=role_name, is_active=active))


def test_receptionist_can_record_normal_payments_but_not_financial_controls():
    permissions = set(staff_permissions(user("receptionist")))
    assert {"staff.read", "staff.write", "billing.read", "billing.create", "billing.payment.record"} <= permissions
    assert not {"financial.refund", "financial.invoice.void", "financial.reports.read"} & permissions


def test_manager_and_admin_have_financial_controls():
    required = {"financial.refund", "financial.invoice.void", "financial.reports.read"}
    for role in ("admin", "manager"):
        assert required <= set(staff_permissions(user(role)))
    # The platform support identity is read-only at the platform boundary and
    # never a tenant finance administrator (see app/core/staff_access.py).
    assert not {p for p in staff_permissions(user("super_admin")) if p.startswith(("financial.", "billing."))}


def test_platform_role_does_not_inherit_tenant_financial_controls():
    assert set(staff_permissions(user("super_admin"))) == {"staff.read", "staff.write"}


def test_mechanic_only_has_assigned_work_and_inactive_role_has_none():
    assert set(staff_permissions(user("mechanic"))) == {"work.read.assigned", "work.write.assigned"}
    assert staff_permissions(user("manager", active=False)) == []
    assert staff_permissions(user("unknown")) == []
