"""Service-level create tests using in-memory repository fakes."""
from types import SimpleNamespace
from decimal import Decimal
import uuid

import pytest
from app.exceptions import UnauthorizedAction, WorkOrderConflict, WorkOrderNotFound, WorkOrderValidationError
from app.models.service_record import ServiceRecord
from app.schemas.work_order import WorkOrderCreateRequest, WorkOrderUpdateRequest
from app.services import work_order_service


TENANT_ID = uuid.uuid4()
CUSTOMER_ID = uuid.uuid4()
VEHICLE_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()


class MemoryWorkOrderRepository:
    def __init__(self, session, service_center_id):
        self.items = {}
        self.by_key = {}
        self.by_appointment = {}
        self.create_count = 0

    async def find_by_idempotency_key(self, key):
        order_id = self.by_key.get(key)
        return self.items.get(order_id)

    async def find_by_appointment(self, appointment_id):
        order_id = self.by_appointment.get(appointment_id)
        return self.items.get(order_id)

    async def create(self, **values):
        self.create_count += 1
        values = dict(values)
        status = values.pop("status", "received")
        order = SimpleNamespace(
            id=uuid.uuid4(), **values, status=status,
            started_at=None, ready_at=None, completed_at=None, cancelled_at=None,
            created_at=None, updated_at=None, service_record=None,
            customer=customer, vehicle=vehicle, appointment=None,
            assigned_mechanic=None, created_by=actor,
        )
        if values.get("assigned_mechanic_user_id"):
            order.assigned_mechanic = mechanic
        self.items[order.id] = order
        self.by_key[values["idempotency_key"]] = order.id
        if values.get("appointment_id"):
            self.by_appointment[values["appointment_id"]] = order.id
            order.appointment = appointment
        return order

    async def get_detailed(self, order_id):
        return self.items.get(order_id)

    async def get_for_update(self, order_id):
        return self.items.get(order_id)

    async def list_work_orders(self, *, skip, limit, status=None, assigned_mechanic_user_id=None):
        rows = list(self.items.values())
        if status:
            rows = [row for row in rows if row.status == status]
        if assigned_mechanic_user_id is not None:
            rows = [row for row in rows if row.assigned_mechanic_user_id == assigned_mechanic_user_id]
        rows.sort(key=lambda row: str(row.id))
        return rows[skip:skip + limit], len(rows)


customer = SimpleNamespace(id=CUSTOMER_ID, service_center_id=TENANT_ID, is_active=True, full_name="Test Customer")
vehicle = SimpleNamespace(
    id=VEHICLE_ID, service_center_id=TENANT_ID, customer_id=CUSTOMER_ID,
    is_active=True, current_km=12000, license_plate="01 A 123 AA", vehicle_model=None,
)
mechanic = SimpleNamespace(
    id=uuid.uuid4(), service_center_id=TENANT_ID, is_active=True,
    role=SimpleNamespace(name="mechanic", is_active=True), full_name="Test Mechanic",
)
appointment = SimpleNamespace(
    id=uuid.uuid4(), service_center_id=TENANT_ID, customer_id=CUSTOMER_ID,
    vehicle_id=VEHICLE_ID, is_active=True, status="confirmed",
)
appointment.slot = SimpleNamespace(status="booked", appointment_id=appointment.id)
actor = SimpleNamespace(
    id=ACTOR_ID, service_center_id=TENANT_ID, is_active=True, full_name="Reception",
    role=SimpleNamespace(name="admin", is_active=True),
)


@pytest.fixture
def memory_service(monkeypatch):
    work_orders = MemoryWorkOrderRepository(None, TENANT_ID)

    class Customers:
        def __init__(self, *args): pass
        async def get_by_id(self, entity_id): return customer if entity_id == CUSTOMER_ID else None

    class Vehicles:
        def __init__(self, *args): pass
        async def get_by_id(self, entity_id): return vehicle if entity_id == VEHICLE_ID else None

    async def find_appointment(session, service_center_id, appointment_id):
        return appointment if appointment_id == appointment.id and service_center_id == TENANT_ID else None

    async def find_user(session, service_center_id, user_id):
        return mechanic if user_id == mechanic.id and service_center_id == TENANT_ID else None

    monkeypatch.setattr(work_order_service, "WorkOrderRepository", lambda *args: work_orders)
    monkeypatch.setattr(work_order_service, "CustomerRepository", Customers)
    monkeypatch.setattr(work_order_service, "VehicleRepository", Vehicles)
    monkeypatch.setattr(work_order_service, "get_appointment_for_update", find_appointment)
    monkeypatch.setattr(work_order_service, "get_user_for_tenant", find_user)

    audit_logs = []

    async def flush():
        return None
    service_records = []

    def add(value):
        audit_logs.append(value)
        if isinstance(value, ServiceRecord):
            service_records.append(value)

    session = SimpleNamespace(
        bind=None, add=add, flush=flush, audit_logs=audit_logs,
        service_records=service_records,
    )
    events = []
    uow = SimpleNamespace(
        session=session, service_center_id=TENANT_ID,
        add_event=events.append, events=events,
    )
    service = work_order_service.WorkOrderService(uow, actor)
    return service, work_orders


@pytest.mark.asyncio
async def test_walk_in_create_uses_tenant_actor_and_does_not_require_appointment(memory_service):
    service, repository = memory_service
    body = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
        service_type="Oil change", intake_odometer_km=12000,
    )

    result = await service.create_work_order(body, "walk-in-1")

    order = repository.items[uuid.UUID(result["id"])]
    assert result["status"] == "received"
    assert order.appointment_id is None
    assert order.created_by_user_id == ACTOR_ID
    assert repository.create_count == 1
    assert "phone" not in result and "address" not in result
    audit = service.uow.session.audit_logs[0]
    assert audit.action == "work_order.created"
    assert audit.resource_id == order.id
    assert audit.context == {"appointment_linked": False, "status": "received"}


@pytest.mark.asyncio
async def test_create_retry_returns_existing_order_and_rejects_key_reuse(memory_service):
    service, repository = memory_service
    first = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change",
    )
    first_result = await service.create_work_order(first, "retry-key")
    same = await service.create_work_order(first, "retry-key")
    assert same["id"] == first_result["id"]
    assert repository.create_count == 1

    changed = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Brake repair",
    )
    with pytest.raises(WorkOrderConflict):
        await service.create_work_order(changed, "retry-key")


@pytest.mark.asyncio
async def test_appointment_can_only_be_linked_to_one_work_order(memory_service):
    service, repository = memory_service
    original_status = appointment.status
    try:
        body = WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
            appointment_id=appointment.id, service_type="Oil change",
        )
        await service.create_work_order(body, "appointment-first-key")
        with pytest.raises(WorkOrderConflict):
            await service.create_work_order(body, "appointment-second-key")
        assert repository.create_count == 1
    finally:
        appointment.status = original_status


@pytest.mark.asyncio
async def test_create_rejects_vehicle_not_owned_by_customer(memory_service):
    service, _ = memory_service
    vehicle.customer_id = uuid.uuid4()
    try:
        body = WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change",
        )
        with pytest.raises(WorkOrderValidationError):
            await service.create_work_order(body, "ownership-key")
    finally:
        vehicle.customer_id = CUSTOMER_ID


@pytest.mark.asyncio
async def test_appointment_create_links_matching_visit_and_marks_it_in_progress(memory_service):
    service, repository = memory_service
    original_status = appointment.status
    try:
        body = WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
            appointment_id=appointment.id, service_type="Oil change",
        )
        result = await service.create_work_order(body, "appointment-key")
        order = repository.items[uuid.UUID(result["id"])]

        assert order.appointment_id == appointment.id
        assert appointment.status == "in_progress"
    finally:
        appointment.status = original_status


@pytest.mark.asyncio
async def test_create_rejects_intake_odometer_below_current_vehicle_mileage(memory_service):
    service, _ = memory_service
    body = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
        service_type="Oil change", intake_odometer_km=11999,
    )
    with pytest.raises(WorkOrderValidationError):
        await service.create_work_order(body, "low-odometer-key")


@pytest.mark.asyncio
async def test_create_requires_assignment_to_an_active_mechanic(memory_service):
    service, _ = memory_service
    original_role = mechanic.role
    try:
        mechanic.role = SimpleNamespace(name="manager", is_active=True)
        body = WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
            service_type="Oil change", assigned_mechanic_user_id=mechanic.id,
        )
        with pytest.raises(WorkOrderValidationError):
            await service.create_work_order(body, "bad-mechanic-key")
    finally:
        mechanic.role = original_role


@pytest.mark.asyncio
async def test_list_filters_paginates_and_returns_total(memory_service):
    service, repository = memory_service
    body = WorkOrderCreateRequest(customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change")
    first = await service.create_work_order(body, "list-first-key")
    second = await service.create_work_order(body, "list-second-key")
    repository.items[uuid.UUID(second["id"])].status = "ready"

    page = await service.list_work_orders(page=1, page_size=10, status="received")

    assert page["total"] == 1
    assert page["total_pages"] == 1
    assert page["items"][0]["id"] == first["id"]


@pytest.mark.asyncio
async def test_mechanic_list_and_detail_are_limited_to_assigned_orders(memory_service):
    service, repository = memory_service
    assigned = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change",
        assigned_mechanic_user_id=mechanic.id,
    )
    unassigned = WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Tire rotation",
    )
    assigned_result = await service.create_work_order(assigned, "mechanic-order-key")
    unassigned_result = await service.create_work_order(unassigned, "unassigned-order-key")
    original_role, original_actor_id = actor.role, actor.id
    try:
        actor.role = SimpleNamespace(name="mechanic", is_active=True)
        actor.id = mechanic.id
        visible = await service.list_work_orders(page=1, page_size=20)
        assert [row["id"] for row in visible["items"]] == [assigned_result["id"]]
        assert (await service.get_work_order(uuid.UUID(assigned_result["id"])))['id'] == assigned_result["id"]
        with pytest.raises(WorkOrderNotFound):
            await service.get_work_order(uuid.UUID(unassigned_result["id"]))
    finally:
        actor.role = original_role
        actor.id = original_actor_id


@pytest.mark.asyncio
async def test_ready_transition_creates_one_history_updates_mileage_and_completes_appointment(memory_service):
    service, repository = memory_service
    original_status = appointment.status
    original_km = vehicle.current_km
    try:
        body = WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
            appointment_id=appointment.id, service_type="Brake repair",
            intake_odometer_km=12500,
        )
        created = await service.create_work_order(body, "ready-flow-key")
        order_id = uuid.UUID(created["id"])
        await service.update_work_order(order_id, WorkOrderUpdateRequest(status="in_progress"))
        ready = await service.update_work_order(order_id, WorkOrderUpdateRequest(
            status="ready", work_performed="Replaced front brake pads",
            completion_odometer_km=12600, actual_cost=Decimal("250.00"),
        ))

        assert ready["status"] == "ready"
        assert ready["service_record_id"]
        assert len(service.uow.session.service_records) == 1
        record = service.uow.session.service_records[0]
        assert record.work_order_id == order_id
        assert record.appointment_id == appointment.id
        assert record.performed_km == 12600
        assert record.description == "Replaced front brake pads"
        assert record.technician_notes is None
        assert vehicle.current_km == 12600
        assert appointment.status == "completed"
        ready_audit = next(
            entry for entry in service.uow.session.audit_logs
            if getattr(entry, "resource_id", None) == order_id
            and getattr(entry, "context", {}).get("to_status") == "ready"
        )
        assert ready_audit.action == "work_order.updated"
        assert ready_audit.actor_user_id == actor.id
        assert ready_audit.context["from_status"] == "in_progress"
        assert ready_audit.context["service_record_created"] is True
        completed_event = next(event for event in service.uow.events if event.__class__.__name__ == "AppointmentCompleted")
        assert completed_event.service_record_id == record.id

        replay = await service.update_work_order(order_id, WorkOrderUpdateRequest(status="ready"))
        assert replay["service_record_id"] == ready["service_record_id"]
        assert len(service.uow.session.service_records) == 1
    finally:
        appointment.status = original_status
        vehicle.current_km = original_km


@pytest.mark.asyncio
async def test_final_odometer_cannot_be_lower_than_intake_or_current_mileage(memory_service):
    service, _ = memory_service
    created = await service.create_work_order(WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
        service_type="Oil change", intake_odometer_km=12000,
    ), "decreasing-final-odo-key")
    order_id = uuid.UUID(created["id"])
    await service.update_work_order(order_id, WorkOrderUpdateRequest(status="in_progress"))
    with pytest.raises(WorkOrderValidationError):
        await service.update_work_order(order_id, WorkOrderUpdateRequest(
            status="ready", work_performed="Changed oil", completion_odometer_km=11999,
        ))
    assert service.uow.session.service_records == []


@pytest.mark.asyncio
async def test_cancelling_received_order_cancels_appointment_without_releasing_slot(memory_service):
    service, _ = memory_service
    original_status = appointment.status
    original_slot_status = appointment.slot.status
    try:
        created = await service.create_work_order(WorkOrderCreateRequest(
            customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID,
            appointment_id=appointment.id, service_type="Oil change",
        ), "cancel-appointment-key")
        await service.update_work_order(
            uuid.UUID(created["id"]), WorkOrderUpdateRequest(status="cancelled")
        )
        assert appointment.status == "cancelled"
        assert appointment.slot.status == "booked"
        assert appointment.slot.appointment_id == appointment.id
    finally:
        appointment.status = original_status
        appointment.slot.status = original_slot_status


@pytest.mark.asyncio
async def test_ready_requires_work_performed_and_invalid_skips_are_rejected(memory_service):
    service, _ = memory_service
    created = await service.create_work_order(WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change",
    ), "transition-key")
    order_id = uuid.UUID(created["id"])
    with pytest.raises(WorkOrderConflict):
        await service.update_work_order(order_id, WorkOrderUpdateRequest(status="completed"))
    await service.update_work_order(order_id, WorkOrderUpdateRequest(status="in_progress"))
    with pytest.raises(WorkOrderValidationError):
        await service.update_work_order(order_id, WorkOrderUpdateRequest(status="ready"))


@pytest.mark.asyncio
async def test_mechanic_can_start_and_ready_assigned_work_but_cannot_close_or_set_cost(memory_service):
    service, _ = memory_service
    created = await service.create_work_order(WorkOrderCreateRequest(
        customer_id=CUSTOMER_ID, vehicle_id=VEHICLE_ID, service_type="Oil change",
        assigned_mechanic_user_id=mechanic.id,
    ), "mechanic-flow-key")
    order_id = uuid.UUID(created["id"])
    original_role, original_actor_id = actor.role, actor.id
    try:
        actor.role = SimpleNamespace(name="mechanic", is_active=True)
        actor.id = mechanic.id
        await service.update_work_order(order_id, WorkOrderUpdateRequest(status="in_progress"))
        with pytest.raises(UnauthorizedAction):
            await service.update_work_order(order_id, WorkOrderUpdateRequest(
                work_performed="Changed oil", actual_cost=Decimal("100.00"),
            ))
        ready = await service.update_work_order(order_id, WorkOrderUpdateRequest(
            status="ready", work_performed="Changed oil",
        ))
        assert ready["status"] == "ready"
        with pytest.raises(UnauthorizedAction):
            await service.update_work_order(order_id, WorkOrderUpdateRequest(status="completed"))
    finally:
        actor.role = original_role
        actor.id = original_actor_id
