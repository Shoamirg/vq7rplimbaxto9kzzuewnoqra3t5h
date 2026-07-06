"""appointments.mechanic_user_id

Links a job to the mechanic's *user account* (not just a name string) so the
Mechanic Workspace can query "my jobs". Backfills the FK from the existing
mechanic_name by matching a mechanic-role user in the same tenant.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-06 14:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("mechanic_user_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_appointments_mechanic_user_id", "appointments", ["mechanic_user_id"])
    # Backfill from the name string to the matching mechanic user in the tenant.
    op.execute(
        """
        UPDATE appointments a
        SET mechanic_user_id = u.id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.service_center_id = a.service_center_id
          AND u.full_name = a.mechanic_name
          AND r.name = 'mechanic'
          AND a.mechanic_name IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_appointments_mechanic_user_id", table_name="appointments")
    op.drop_column("appointments", "mechanic_user_id")
