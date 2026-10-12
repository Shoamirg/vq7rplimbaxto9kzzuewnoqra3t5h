"""Add work orders and their service history link.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-12 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "work_orders",
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_mechanic_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_type", sa.String(length=100), nullable=False),
        sa.Column("customer_concern", sa.Text(), nullable=True),
        sa.Column("work_performed", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("intake_odometer_km", sa.Integer(), nullable=True),
        sa.Column("completion_odometer_km", sa.Integer(), nullable=True),
        sa.Column("actual_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "intake_odometer_km IS NULL OR intake_odometer_km >= 0",
            name="ck_work_orders_intake_odometer_nonnegative",
        ),
        sa.CheckConstraint(
            "completion_odometer_km IS NULL OR completion_odometer_km >= 0",
            name="ck_work_orders_completion_odometer_nonnegative",
        ),
        sa.CheckConstraint("actual_cost IS NULL OR actual_cost >= 0", name="ck_work_orders_cost_nonnegative"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_mechanic_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_center_id", "idempotency_key", name="uq_work_orders_center_idempotency"),
    )
    op.create_index("ix_work_orders_id", "work_orders", ["id"])
    op.create_index("ix_work_orders_service_center_id", "work_orders", ["service_center_id"])
    op.create_index("ix_work_orders_customer_id", "work_orders", ["customer_id"])
    op.create_index("ix_work_orders_vehicle_id", "work_orders", ["vehicle_id"])
    op.create_index("ix_work_orders_status", "work_orders", ["status"])
    op.create_index(
        "uq_work_orders_appointment_id", "work_orders", ["appointment_id"], unique=True,
        postgresql_where=sa.text("appointment_id IS NOT NULL"),
    )
    op.create_index(
        "ix_work_orders_center_status_created", "work_orders",
        ["service_center_id", "status", "created_at"],
    )
    op.create_index(
        "ix_work_orders_assignee_status", "work_orders",
        ["assigned_mechanic_user_id", "status"],
    )

    op.add_column("service_records", sa.Column("work_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_service_records_work_order_id_work_orders",
        "service_records", "work_orders", ["work_order_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "uq_service_records_work_order_id", "service_records", ["work_order_id"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_service_records_work_order_id", table_name="service_records")
    op.drop_constraint(
        "fk_service_records_work_order_id_work_orders", "service_records", type_="foreignkey",
    )
    op.drop_column("service_records", "work_order_id")
    op.drop_index("ix_work_orders_assignee_status", table_name="work_orders")
    op.drop_index("ix_work_orders_center_status_created", table_name="work_orders")
    op.drop_index("uq_work_orders_appointment_id", table_name="work_orders")
    op.drop_index("ix_work_orders_status", table_name="work_orders")
    op.drop_index("ix_work_orders_vehicle_id", table_name="work_orders")
    op.drop_index("ix_work_orders_customer_id", table_name="work_orders")
    op.drop_index("ix_work_orders_service_center_id", table_name="work_orders")
    op.drop_index("ix_work_orders_id", table_name="work_orders")
    op.drop_table("work_orders")
