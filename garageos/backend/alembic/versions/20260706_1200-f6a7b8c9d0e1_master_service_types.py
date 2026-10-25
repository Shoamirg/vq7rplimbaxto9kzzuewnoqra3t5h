"""master service_types

Adds users.service_types — the list of service types (from the maintenance-rule
catalog) that a master/mechanic performs. Drives the Masters page and, later,
per-service job routing.

Revision ID: f6a7b8c9d0e1
Revises: d1e2f3a4b5c6
Create Date: 2026-07-06 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("service_types", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "service_types")
