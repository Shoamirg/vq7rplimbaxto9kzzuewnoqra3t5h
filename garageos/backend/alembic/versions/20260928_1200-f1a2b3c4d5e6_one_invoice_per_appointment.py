"""One final invoice and one service record per appointment.

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Older versions allowed several active invoices for one appointment.
    # Keep the newest linked and preserve every older document/ledger entry,
    # but detach the extra invoice from the appointment before indexing.
    op.execute(sa.text("""
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY service_center_id, appointment_id
                ORDER BY created_at DESC, id DESC
            ) AS rank
            FROM invoices
            WHERE kind = 'invoice' AND appointment_id IS NOT NULL AND is_active = true
        )
        UPDATE invoices AS i
        SET appointment_id = NULL
        FROM ranked AS r
        WHERE i.id = r.id AND r.rank > 1
    """))
    op.create_index(
        "uq_invoices_final_appointment", "invoices",
        ["service_center_id", "appointment_id"], unique=True,
        postgresql_where=sa.text("kind = 'invoice' AND appointment_id IS NOT NULL AND is_active = true"),
    )
    op.execute(sa.text("""
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY appointment_id ORDER BY created_at DESC, id DESC
            ) AS rank
            FROM service_records
            WHERE appointment_id IS NOT NULL
        )
        UPDATE service_records AS s
        SET appointment_id = NULL
        FROM ranked AS r
        WHERE s.id = r.id AND r.rank > 1
    """))
    op.create_index(
        "uq_service_records_appointment", "service_records", ["appointment_id"],
        unique=True, postgresql_where=sa.text("appointment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_service_records_appointment"))
    op.execute(sa.text("DROP INDEX IF EXISTS uq_invoices_final_appointment"))
