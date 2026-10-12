"""Unit tests for work order authorization and request identity."""
import pytest

from app.exceptions import UnauthorizedAction, WorkOrderNotFound
from app.services.work_order_policy import request_fingerprint, require_work_order_action


@pytest.mark.parametrize("role", ["admin", "manager", "receptionist"])
def test_office_roles_can_manage_a_work_order(role):
    require_work_order_action(role, role_active=True, action="complete")


@pytest.mark.parametrize("action", ["read", "edit_work", "start", "ready"])
def test_mechanic_can_read_and_work_on_assigned_order(action):
    require_work_order_action(
        "mechanic", role_active=True, action=action,
        actor_user_id="mechanic-1", assigned_mechanic_user_id="mechanic-1",
    )


def test_mechanic_cannot_read_an_unassigned_order():
    with pytest.raises(WorkOrderNotFound):
        require_work_order_action(
            "mechanic", role_active=True, action="read",
            actor_user_id="mechanic-1", assigned_mechanic_user_id="mechanic-2",
        )


@pytest.mark.parametrize("action", ["create", "assign", "cancel", "complete"])
def test_mechanic_cannot_manage_reception_actions(action):
    with pytest.raises(UnauthorizedAction):
        require_work_order_action(
            "mechanic", role_active=True, action=action,
            actor_user_id="mechanic-1", assigned_mechanic_user_id="mechanic-1",
        )


@pytest.mark.parametrize("role,active", [(None, True), ("unknown", True), ("admin", False), ("super_admin", True)])
def test_unknown_inactive_and_super_admin_roles_are_denied(role, active):
    with pytest.raises(UnauthorizedAction):
        require_work_order_action(role, role_active=active, action="list")


def test_fingerprint_is_stable_for_field_order_and_changes_with_payload():
    first = {"customer_id": "c1", "vehicle_id": "v1", "appointment_id": None}
    reordered = {"appointment_id": None, "vehicle_id": "v1", "customer_id": "c1"}
    changed = {**first, "vehicle_id": "v2"}

    assert request_fingerprint(first) == request_fingerprint(reordered)
    assert request_fingerprint(first) != request_fingerprint(changed)
