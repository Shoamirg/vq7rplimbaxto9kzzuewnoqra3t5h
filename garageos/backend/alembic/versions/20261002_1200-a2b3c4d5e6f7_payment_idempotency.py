"""Keep a repeated payment request from recording money twice.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invoice_payments", sa.Column("idempotency_key", sa.String(36), nullable=True))
    op.create_index("uq_invoice_payments_idempotency", "invoice_payments",
                    ["service_center_id", "invoice_id", "idempotency_key"], unique=True)


def downgrade():
    op.drop_index("uq_invoice_payments_idempotency", table_name="invoice_payments")
    op.drop_column("invoice_payments", "idempotency_key")
