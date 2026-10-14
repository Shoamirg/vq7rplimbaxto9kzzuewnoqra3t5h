"""Separate customer password identities from staff."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = depends_on = None

def upgrade():
    op.create_table('customer_accounts',
        sa.Column('customer_id',postgresql.UUID(as_uuid=True),nullable=False),
        sa.Column('email',sa.String(255),nullable=False),
        sa.Column('password_hash',sa.String(255),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),
        sa.Column('id',postgresql.UUID(as_uuid=True),nullable=False),
        sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('updated_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),
        sa.Column('is_active',sa.Boolean(),nullable=False),
        sa.Column('service_center_id',postgresql.UUID(as_uuid=True),nullable=False),
        sa.PrimaryKeyConstraint('id'),sa.UniqueConstraint('customer_id'),sa.UniqueConstraint('email'),
        sa.ForeignKeyConstraint(['customer_id'],['customers.id'],ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['service_center_id'],['service_centers.id'],ondelete='CASCADE'))
    op.create_index('ix_customer_accounts_id','customer_accounts',['id'])
    op.create_index('ix_customer_accounts_service_center_id','customer_accounts',['service_center_id'])

def downgrade():
    op.drop_table('customer_accounts')
