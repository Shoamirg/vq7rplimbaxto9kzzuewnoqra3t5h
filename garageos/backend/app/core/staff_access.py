"""Capabilities of the current shared staff panel.

Mechanics use only their account-assigned work routes. Reception/management
operate the shared tenant workspace.
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
        return ["work.read.assigned", "work.write.assigned"]
    return []
