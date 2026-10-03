"""migrate existing inbox tables without demo seeding

Revision ID: e1bdd605818c
Revises: b3c4d5e6f7a8
Create Date: 2026-10-04 00:42:34.109474
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e1bdd605818c'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Older demo seeds created these tables outside Alembic. Adopt them without
    # replacing existing tables or messages; fresh installs create them here.
    op.create_table('conversations',
        sa.Column('subject', sa.String(length=200), nullable=True),
        sa.Column('conv_type', sa.String(length=24), nullable=False),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('priority', sa.String(length=16), nullable=False),
        sa.Column('last_channel', sa.String(length=24), nullable=True),
        sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_activity_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_message_preview', sa.String(length=300), nullable=True),
        sa.Column('last_sender_role', sa.String(length=24), nullable=True),
        sa.Column('unread_messages', sa.Integer(), nullable=False),
        sa.Column('unread_activity', sa.Integer(), nullable=False),
        sa.Column('ai_summary', sa.String(length=200), nullable=True),
        sa.Column('summary_version', sa.Integer(), nullable=False),
        sa.Column('summary_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('assigned_user_id', sa.UUID(), nullable=True),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('vehicle_id', sa.UUID(), nullable=True),
        sa.Column('appointment_id', sa.UUID(), nullable=True),
        sa.Column('case_id', sa.UUID(), nullable=True),
        sa.Column('invoice_id', sa.UUID(), nullable=True),
        sa.Column('pinned_notes', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('service_center_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['case_id'], ['operational_cases.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_center_id'], ['service_centers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_conversations_assigned_user_id'), 'conversations', ['assigned_user_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_case_id'), 'conversations', ['case_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_conv_type'), 'conversations', ['conv_type'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_customer_id'), 'conversations', ['customer_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_id'), 'conversations', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_last_activity_at'), 'conversations', ['last_activity_at'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_service_center_id'), 'conversations', ['service_center_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_status'), 'conversations', ['status'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversations_vehicle_id'), 'conversations', ['vehicle_id'], unique=False, if_not_exists=True)
    op.create_table('conversation_messages',
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('channel', sa.String(length=24), nullable=False),
        sa.Column('is_internal', sa.Boolean(), nullable=False),
        sa.Column('author_role', sa.String(length=24), nullable=False),
        sa.Column('author_name', sa.String(length=120), nullable=True),
        sa.Column('author_user_id', sa.UUID(), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('delivery_status', sa.String(length=16), nullable=False),
        sa.Column('mentions', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('service_center_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_center_id'], ['service_centers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_conversation_messages_conversation_id'), 'conversation_messages', ['conversation_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_messages_id'), 'conversation_messages', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_messages_service_center_id'), 'conversation_messages', ['service_center_id'], unique=False, if_not_exists=True)
    op.create_table('conversation_participants',
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(length=24), nullable=False),
        sa.Column('display_name', sa.String(length=120), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('is_following', sa.Boolean(), nullable=False),
        sa.Column('is_online', sa.Boolean(), nullable=False),
        sa.Column('is_typing', sa.Boolean(), nullable=False),
        sa.Column('active_channel', sa.String(length=24), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('service_center_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['service_center_id'], ['service_centers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_conversation_participants_conversation_id'), 'conversation_participants', ['conversation_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_participants_id'), 'conversation_participants', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_participants_service_center_id'), 'conversation_participants', ['service_center_id'], unique=False, if_not_exists=True)
    op.create_table('conversation_attachments',
        sa.Column('message_id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('service_center_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['message_id'], ['conversation_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_center_id'], ['service_centers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.create_index(op.f('ix_conversation_attachments_conversation_id'), 'conversation_attachments', ['conversation_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_attachments_id'), 'conversation_attachments', ['id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_attachments_message_id'), 'conversation_attachments', ['message_id'], unique=False, if_not_exists=True)
    op.create_index(op.f('ix_conversation_attachments_service_center_id'), 'conversation_attachments', ['service_center_id'], unique=False, if_not_exists=True)


def downgrade() -> None:
    # The prior application already used this schema and may have created it
    # through demo seeding. Keep inbox tables/data on rollback, including fresh
    # installs. Re-upgrade adopts them again; removal must be a separate, explicit
    # operator decision with a backup, never an automatic downgrade side effect.
    pass
