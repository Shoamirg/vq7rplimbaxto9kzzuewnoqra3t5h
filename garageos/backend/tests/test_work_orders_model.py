"""Database-independent schema invariants for work orders."""

from app.models import ServiceRecord, WorkOrder
from sqlalchemy.orm import configure_mappers


def test_work_order_has_tenant_owned_create_idempotency_and_valid_mileage():
    table = WorkOrder.__table__

    assert {"service_center_id", "customer_id", "vehicle_id", "created_by_user_id"} <= set(table.c.keys())
    assert {"idempotency_key", "request_fingerprint"} <= set(table.c.keys())
    assert table.c.intake_odometer_km.nullable
    assert not table.c.idempotency_key.nullable
    assert not table.c.request_fingerprint.nullable
    assert any("intake_odometer_km >= 0" in str(c.sqltext) for c in table.constraints if hasattr(c, "sqltext"))
    assert any("completion_odometer_km >= 0" in str(c.sqltext) for c in table.constraints if hasattr(c, "sqltext"))


def test_work_order_and_service_history_have_database_uniqueness_guards():
    configure_mappers()
    order_table = WorkOrder.__table__
    service_table = ServiceRecord.__table__

    assert any(
        index.unique and "appointment_id" in {column.name for column in index.columns}
        for index in order_table.indexes
    )
    assert any(
        constraint.name == "uq_work_orders_center_idempotency"
        for constraint in order_table.constraints
    )
    assert service_table.c.work_order_id.nullable
    assert any(
        index.unique and "work_order_id" in {column.name for column in index.columns}
        for index in service_table.indexes
    )
    assert not WorkOrder.__mapper__.relationships.service_record.uselist
