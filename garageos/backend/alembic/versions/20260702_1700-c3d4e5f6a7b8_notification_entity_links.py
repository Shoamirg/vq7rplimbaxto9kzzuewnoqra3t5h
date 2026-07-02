"""notification entity links (vehicle_id, customer_id)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-02 17:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("vehicle_id", UUID(as_uuid=True), nullable=True))
    op.add_column("notifications", sa.Column("customer_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_notifications_vehicle_id", "notifications", ["vehicle_id"])
    op.create_index("ix_notifications_customer_id", "notifications", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_customer_id", table_name="notifications")
    op.drop_index("ix_notifications_vehicle_id", table_name="notifications")
    op.drop_column("notifications", "customer_id")
    op.drop_column("notifications", "vehicle_id")
