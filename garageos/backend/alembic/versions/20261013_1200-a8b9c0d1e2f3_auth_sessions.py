"""Persist bounded staff/customer sessions; legacy tokens require sign-in."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = depends_on = None


def upgrade():
    op.create_table("auth_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("principal_kind", sa.String(16), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True)),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_account_id", postgresql.UUID(as_uuid=True)),
        sa.Column("account_version", sa.Integer()),
        sa.Column("demo", sa.Boolean(), nullable=False),
        sa.Column("refresh_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("(principal_kind = 'staff' AND user_id IS NOT NULL AND customer_id IS NULL "
                           "AND customer_account_id IS NULL AND account_version IS NULL) OR "
                           "(principal_kind = 'customer' AND customer_id IS NOT NULL AND user_id IS NULL "
                           "AND ((customer_account_id IS NULL AND account_version IS NULL) OR "
                           "(customer_account_id IS NOT NULL AND account_version IS NOT NULL)))",
                           name="ck_auth_session_principal"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_account_id"], ["customer_accounts.id"], ondelete="CASCADE"),
        if_not_exists=True,
    )
    for column in ("user_id", "customer_id", "service_center_id"):
        op.create_index(f"ix_auth_sessions_{column}", "auth_sessions", [column], if_not_exists=True)


def downgrade():
    op.drop_table("auth_sessions")
