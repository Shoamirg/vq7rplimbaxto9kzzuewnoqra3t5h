"""Capabilities of the current shared staff panel.

The dedicated mechanic workflow is a later milestone. Mechanics can inspect
the shared tenant workspace, while reception/management operate its records.
Unknown role names grant no access; the platform flag never bypasses a tenant.
"""
from app.models.user import User

_OPERATORS = {"admin", "manager", "receptionist", "super_admin"}


def staff_permissions(user: User) -> list[str]:
    role = user.role
    if not role or not role.is_active:
        return []
    if role.name in _OPERATORS:
        return ["staff.read", "staff.write"]
    if role.name == "mechanic":
        return ["staff.read"]
    return []
