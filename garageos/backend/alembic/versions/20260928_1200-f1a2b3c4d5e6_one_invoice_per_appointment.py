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
    # The historical initial migration predates billing. Existing demo DBs
    # acquired this table through init_db(), while a clean Alembic replay has
    # not reached the seeder yet. Create the current billing parent table when
    # absent so the constraint below works in both paths.
    if not sa.inspect(op.get_bind()).has_table("invoices"):
        op.create_table(
            "invoices",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("service_center_id", sa.UUID(), sa.ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("code", sa.String(24), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("customer_id", sa.UUID(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("vehicle_id", sa.UUID(), sa.ForeignKey("vehicles.id", ondelete="SET NULL")),
            sa.Column("appointment_id", sa.UUID(), sa.ForeignKey("appointments.id", ondelete="SET NULL")),
            sa.Column("case_id", sa.UUID(), sa.ForeignKey("operational_cases.id", ondelete="SET NULL")),
            sa.Column("source_estimate_id", sa.UUID(), sa.ForeignKey("invoices.id", ondelete="SET NULL")),
            sa.Column("work_order_id", sa.UUID()),
            sa.Column("currency", sa.String(3), nullable=False),
            sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False),
            sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
            sa.Column("discount_total", sa.Numeric(10, 2), nullable=False),
            sa.Column("tax_total", sa.Numeric(10, 2), nullable=False),
            sa.Column("total", sa.Numeric(10, 2), nullable=False),
            sa.Column("amount_paid", sa.Numeric(10, 2), nullable=False),
            sa.Column("balance", sa.Numeric(10, 2), nullable=False),
            sa.Column("notes", sa.Text()),
            sa.Column("terms", sa.Text()),
            sa.Column("issued_at", sa.DateTime(timezone=True)),
            sa.Column("due_date", sa.Date()),
            sa.Column("viewed_at", sa.DateTime(timezone=True)),
            sa.Column("approved_at", sa.DateTime(timezone=True)),
            sa.Column("paid_at", sa.DateTime(timezone=True)),
            sa.Column("created_by_user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        )
        for column in ("id", "service_center_id", "code", "kind", "status", "customer_id", "vehicle_id", "due_date"):
            op.create_index(f"ix_invoices_{column}", "invoices", [column])

    if not sa.inspect(op.get_bind()).has_table("invoice_line_items"):
        op.create_table(
            "invoice_line_items",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("service_center_id", sa.UUID(), sa.ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("invoice_id", sa.UUID(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("description", sa.String(255), nullable=False),
            sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
            sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
            sa.Column("taxable", sa.Boolean(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
        )
        for column in ("id", "service_center_id", "invoice_id"):
            op.create_index(f"ix_invoice_line_items_{column}", "invoice_line_items", [column])

    if not sa.inspect(op.get_bind()).has_table("invoice_payments"):
        op.create_table(
            "invoice_payments",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("service_center_id", sa.UUID(), sa.ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("invoice_id", sa.UUID(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("method", sa.String(16), nullable=False),
            sa.Column("source", sa.String(16), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("reference", sa.String(120)),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("note", sa.String(255)),
            sa.Column("created_by_user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        )
        for column in ("id", "service_center_id", "invoice_id"):
            op.create_index(f"ix_invoice_payments_{column}", "invoice_payments", [column])

    if not sa.inspect(op.get_bind()).has_table("ledger_entries"):
        op.create_table(
            "ledger_entries",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("service_center_id", sa.UUID(), sa.ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("customer_id", sa.UUID(), sa.ForeignKey("customers.id", ondelete="CASCADE")),
            sa.Column("invoice_id", sa.UUID(), sa.ForeignKey("invoices.id", ondelete="SET NULL")),
            sa.Column("entry_type", sa.String(24), nullable=False),
            sa.Column("direction", sa.String(8), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("currency", sa.String(3), nullable=False),
            sa.Column("description", sa.String(255)),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        )
        for column in ("id", "service_center_id", "customer_id", "invoice_id", "entry_type"):
            op.create_index(f"ix_ledger_entries_{column}", "ledger_entries", [column])

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
    if "uq_invoices_final_appointment" not in {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes("invoices")
    }:
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
    if "uq_service_records_appointment" not in {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes("service_records")
    }:
        op.create_index(
            "uq_service_records_appointment", "service_records", ["appointment_id"],
            unique=True, postgresql_where=sa.text("appointment_id IS NOT NULL"),
        )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_service_records_appointment"))
    op.execute(sa.text("DROP INDEX IF EXISTS uq_invoices_final_appointment"))
