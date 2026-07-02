"""service center white-label branding

Revision ID: a1b2c3d4e5f6
Revises: f03bf3d4f4fc
Create Date: 2026-07-02 13:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f03bf3d4f4fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("brand_name", sa.String(length=120)),
    ("tagline", sa.String(length=160)),
    ("monogram", sa.String(length=4)),
    ("primary_color", sa.String(length=9)),
    ("accent_color", sa.String(length=9)),
    ("slug", sa.String(length=60)),
]


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("service_centers", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _type in reversed(_COLUMNS):
        op.drop_column("service_centers", name)
