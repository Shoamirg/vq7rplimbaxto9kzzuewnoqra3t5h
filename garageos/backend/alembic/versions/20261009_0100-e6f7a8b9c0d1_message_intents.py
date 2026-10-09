"""Durable, actor-scoped message submission receipts; no historical backfill."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "message_intents",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_kind", sa.String(8), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fingerprint_version", sa.Integer(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("response", postgresql.JSONB(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_center_id", "conversation_id", "actor_kind", "actor_id", "key",
                            name="uq_message_intent_scope"),
        sa.UniqueConstraint("message_id"),
        sa.CheckConstraint("actor_kind = 'staff' OR actor_kind = 'customer'", name="ck_message_intent_actor_kind"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["conversation_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_message_intents_id", "message_intents", ["id"])
    op.create_index("ix_message_intents_service_center_id", "message_intents", ["service_center_id"])


def downgrade():
    # Removing this table irreversibly loses retry receipts, not messages.
    # Re-upgrade does not infer/backfill receipts from equal text or timestamps.
    op.drop_table("message_intents")
