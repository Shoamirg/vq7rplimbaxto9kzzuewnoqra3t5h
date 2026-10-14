"""Capabilities of the current shared staff panel.

Mechanics use only their account-assigned work routes. Reception/management
operate the shared tenant workspace.
Unknown role names grant no access; the platform flag never bypasses a tenant.
"""
from app.models.user import User

_FINANCE_CAPABILITIES = (
    "billing.read",
    "billing.create",
    "billing.write",
    "billing.payment.record",
)
_MANAGER_FINANCE_CAPABILITIES = (
    "financial.refund",
    "financial.invoice.void",
    "financial.reports.read",
)


def staff_permissions(user: User) -> list[str]:
    role = user.role
    if not role or not role.is_active:
        return []
    # Platform-wide support identity is read-only at the platform boundary;
    # enrollment must not silently turn it into a tenant finance administrator.
    if role.name == "super_admin":
        return ["staff.read", "staff.write"]
    if role.name in {"admin", "manager"}:
        return [
            "staff.read",
            "staff.write",
            *_FINANCE_CAPABILITIES,
            *_MANAGER_FINANCE_CAPABILITIES,
        ]
    if role.name == "receptionist":
        return ["staff.read", "staff.write", *_FINANCE_CAPABILITIES]
    if role.name == "mechanic":
        return ["work.read.assigned", "work.write.assigned"]
    return []
