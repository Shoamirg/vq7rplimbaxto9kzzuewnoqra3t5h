"""Mobile app: push devices, uploaded files; retire account-less customer sessions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "push_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
        if_not_exists=True,
    )
    op.create_index("ix_push_devices_customer_id", "push_devices", ["customer_id"], if_not_exists=True)
    op.create_table(
        "stored_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_stored_files_service_center_id", "stored_files", ["service_center_id"], if_not_exists=True)
    op.create_index("ix_stored_files_customer_id", "stored_files", ["customer_id"], if_not_exists=True)
    # Telegram sign-in is retired: customer sessions without a password account end now.
    op.execute("UPDATE auth_sessions SET revoked_at = now() "
               "WHERE principal_kind = 'customer' AND customer_account_id IS NULL AND revoked_at IS NULL")


def downgrade():
    op.drop_index("ix_stored_files_customer_id", table_name="stored_files", if_exists=True)
    op.drop_index("ix_stored_files_service_center_id", table_name="stored_files", if_exists=True)
    op.drop_table("stored_files", if_exists=True)
    op.drop_index("ix_push_devices_customer_id", table_name="push_devices", if_exists=True)
    op.drop_table("push_devices", if_exists=True)
