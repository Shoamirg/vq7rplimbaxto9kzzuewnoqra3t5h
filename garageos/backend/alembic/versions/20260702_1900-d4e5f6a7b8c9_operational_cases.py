"""operational_cases table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-02 19:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operational_cases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("service_center_id", UUID(as_uuid=True),
                  sa.ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("case_type", sa.String(length=24), nullable=False, server_default="emergency"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="new"),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(length=24), nullable=True),
        sa.Column("customer_id", UUID(as_uuid=True),
                  sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", UUID(as_uuid=True),
                  sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("appointment_id", UUID(as_uuid=True),
                  sa.ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_user_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("location_text", sa.String(length=255), nullable=True),
        sa.Column("location_lat", sa.Float(), nullable=True),
        sa.Column("location_lng", sa.Float(), nullable=True),
        sa.Column("sla_response_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    for col in ("service_center_id", "code", "case_type", "status", "customer_id", "vehicle_id", "assigned_user_id"):
        op.create_index(f"ix_operational_cases_{col}", "operational_cases", [col])


def downgrade() -> None:
    op.drop_table("operational_cases")
