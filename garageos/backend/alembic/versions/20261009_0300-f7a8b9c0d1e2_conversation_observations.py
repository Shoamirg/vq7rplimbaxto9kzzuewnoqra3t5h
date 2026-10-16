"""Shared unread generations and retained server observations; preserve history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = depends_on = None

GENERATIONS = ("message_generation", "activity_generation",
    "acknowledged_message_generation", "acknowledged_activity_generation")
CHECKS = {
    "ck_conversation_message_generation": "message_generation >= acknowledged_message_generation AND acknowledged_message_generation >= 0 "
        "AND unread_messages = message_generation - acknowledged_message_generation",
    "ck_conversation_activity_generation": "activity_generation >= acknowledged_activity_generation AND acknowledged_activity_generation >= 0 "
        "AND unread_activity = activity_generation - acknowledged_activity_generation",
}


def upgrade():
    connection = op.get_bind()
    columns = {column["name"] for column in sa.inspect(connection).get_columns("conversations")}
    present = set(GENERATIONS) & columns
    if present and present != set(GENERATIONS):
        raise RuntimeError("Incomplete conversation generation schema; inspect it before retrying")
    if connection.scalar(sa.text("SELECT 1 FROM conversations WHERE unread_messages < 0 OR unread_activity < 0 LIMIT 1")):
        raise RuntimeError("Negative conversation unread counts; resolve them before upgrading")
    if not present:
        for name in GENERATIONS:
            op.add_column("conversations", sa.Column(name, sa.BigInteger(), server_default=sa.text("0"), nullable=False))
        # Legacy counters are the initial observed-read timeline, not a guessed
        # backfill of past messages, deliveries, participants or notifications.
        connection.execute(sa.text("UPDATE conversations SET message_generation = unread_messages, activity_generation = unread_activity"))
    else:
        # Adopt a current metadata-created schema without resetting any retained
        # authority. An inconsistent populated schema needs explicit repair.
        predicate = " AND ".join(f"({expression})" for expression in CHECKS.values())
        if connection.scalar(sa.text(f"SELECT 1 FROM conversations WHERE NOT ({predicate}) LIMIT 1")):
            raise RuntimeError("Inconsistent conversation generation counts; inspect them before upgrading")
    checks = {constraint["name"] for constraint in sa.inspect(connection).get_check_constraints("conversations")}
    for name, expression in CHECKS.items():
        if name not in checks:
            op.create_check_constraint(name, "conversations", expression)
    op.create_table("conversation_read_observations",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_generation", sa.BigInteger(), nullable=False),
        sa.Column("activity_generation", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("service_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("message_generation >= 0 AND activity_generation >= 0", name="ck_conversation_observation_generations"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_center_id"], ["service_centers.id"], ondelete="CASCADE"),
        if_not_exists=True,
    )
    op.create_index("ix_conversation_read_observations_id", "conversation_read_observations", ["id"], if_not_exists=True)
    op.create_index("ix_conversation_read_observations_service_center_id", "conversation_read_observations", ["service_center_id"], if_not_exists=True)
    op.create_index("ix_conversation_observation_expiry", "conversation_read_observations", ["service_center_id", "expires_at", "id"], if_not_exists=True)


def downgrade():
    # Stop observation producers and preserve a full receipt-bearing backup
    # before rollback. Current counters/history survive; authority does not.
    op.drop_table("conversation_read_observations")
    for name in CHECKS:
        op.drop_constraint(name, "conversations", type_="check")
    for name in reversed(GENERATIONS):
        op.drop_column("conversations", name)
