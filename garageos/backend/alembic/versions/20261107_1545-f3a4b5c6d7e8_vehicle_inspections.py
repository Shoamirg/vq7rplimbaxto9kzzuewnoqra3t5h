"""Digital Vehicle Inspection (DVI) schema: vehicle_inspections and inspection_items.

Adds multi-point digital inspection support (green/yellow/red ratings, notes,
photos, labor/parts estimates, customer online decisions, and public tokens).

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-07 15:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vehicle_inspections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inspector_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=255), nullable=False, server_default="Kompleks texnik ko'rik (DVI)"),
        sa.Column("summary_notes", sa.Text(), nullable=True),
        sa.Column("mileage_at_inspection", sa.Integer(), nullable=True),
        sa.Column("overall_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("public_token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inspector_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_token"),
    )
    op.create_index("ix_vehicle_inspections_id", "vehicle_inspections", ["id"])
    op.create_index("ix_vehicle_inspections_center", "vehicle_inspections", ["service_center_id"])
    op.create_index("ix_vehicle_inspections_vehicle", "vehicle_inspections", ["vehicle_id"])
    op.create_index("ix_vehicle_inspections_customer", "vehicle_inspections", ["customer_id"])
    op.create_index("ix_vehicle_inspections_appointment", "vehicle_inspections", ["appointment_id"])
    op.create_index("ix_vehicle_inspections_status", "vehicle_inspections", ["status"])
    op.create_index("ix_vehicle_inspections_public_token", "vehicle_inspections", ["public_token"])
    op.create_index("ix_inspections_center_status", "vehicle_inspections", ["service_center_id", "status"])
    op.create_index("ix_inspections_center_vehicle", "vehicle_inspections", ["service_center_id", "vehicle_id"])

    op.create_table(
        "inspection_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inspection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="engine_fluids"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.String(length=16), nullable=False, server_default="green"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photos", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("estimated_labor_price", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("estimated_parts_price", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("customer_decision", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("customer_comment", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inspection_id"], ["vehicle_inspections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inspection_items_id", "inspection_items", ["id"])
    op.create_index("ix_inspection_items_center", "inspection_items", ["service_center_id"])
    op.create_index("ix_inspection_items_inspection_id", "inspection_items", ["inspection_id"])


def downgrade() -> None:
    op.drop_table("inspection_items")
    op.drop_table("vehicle_inspections")
