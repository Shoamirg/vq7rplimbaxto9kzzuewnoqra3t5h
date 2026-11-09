"""Parts and Inventory schema: parts, inventory_movements, and invoice_line_items.part_id.

Adds spare parts stock management, SKU/OEM/barcode tracking, cost and retail pricing,
inventory movements ledger (purchase, sale, return, adjustment, loss), and invoice linking.

Revision ID: a2b3c4d5e6f8
Revises: f3a4b5c6d7e8
Create Date: 2026-11-09 10:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a2b3c4d5e6f8"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create parts table
    op.create_table(
        "parts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("oem_number", sa.String(length=64), nullable=True),
        sa.Column("barcode", sa.String(length=64), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("unit", sa.String(length=20), nullable=False, server_default="dona"),
        sa.Column("cost_price", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("retail_price", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("quantity_in_stock", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0"),
        sa.Column("min_stock_level", sa.Numeric(precision=10, scale=2), nullable=False, server_default="5"),
        sa.Column("location", sa.String(length=64), nullable=True),
        sa.Column("supplier_name", sa.String(length=128), nullable=True),
        sa.Column("supplier_phone", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_parts_id", "parts", ["id"])
    op.create_index("ix_parts_name", "parts", ["name"])
    op.create_index("ix_parts_service_center_id", "parts", ["service_center_id"])
    op.create_index("ix_parts_center_sku", "parts", ["service_center_id", "sku"])
    op.create_index("ix_parts_center_barcode", "parts", ["service_center_id", "barcode"])
    op.create_index("ix_parts_center_oem", "parts", ["service_center_id", "oem_number"])
    op.create_index("ix_parts_center_category", "parts", ["service_center_id", "category"])

    # 2. Create inventory_movements table
    op.create_table(
        "inventory_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("movement_type", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("reference_invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reference_appointment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reference_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reference_appointment_id"], ["appointments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_movements_id", "inventory_movements", ["id"])
    op.create_index("ix_movements_center_part", "inventory_movements", ["service_center_id", "part_id"])
    op.create_index("ix_movements_center_type", "inventory_movements", ["service_center_id", "movement_type"])

    # 3. Add part_id column to invoice_line_items
    op.add_column(
        "invoice_line_items",
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_invoice_line_items_part_id",
        "invoice_line_items",
        "parts",
        ["part_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_invoice_line_items_part_id", "invoice_line_items", ["part_id"])


def downgrade() -> None:
    op.drop_constraint("fk_invoice_line_items_part_id", "invoice_line_items", type_="foreignkey")
    op.drop_index("ix_invoice_line_items_part_id", table_name="invoice_line_items")
    op.drop_column("invoice_line_items", "part_id")

    op.drop_index("ix_movements_center_type", table_name="inventory_movements")
    op.drop_index("ix_movements_center_part", table_name="inventory_movements")
    op.drop_index("ix_inventory_movements_id", table_name="inventory_movements")
    op.drop_table("inventory_movements")

    op.drop_index("ix_parts_center_category", table_name="parts")
    op.drop_index("ix_parts_center_oem", table_name="parts")
    op.drop_index("ix_parts_center_barcode", table_name="parts")
    op.drop_index("ix_parts_center_sku", table_name="parts")
    op.drop_index("ix_parts_service_center_id", table_name="parts")
    op.drop_index("ix_parts_name", table_name="parts")
    op.drop_index("ix_parts_id", table_name="parts")
    op.drop_table("parts")
