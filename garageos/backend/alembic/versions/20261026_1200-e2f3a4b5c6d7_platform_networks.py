"""Platform tree: dealer networks, workshop membership, customer registration source."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e2f3a4b5c6d7"
down_revision = "f6a7b8c9d0e1"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "networks",
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False),
        sa.Column("is_exclusive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_networks_id", "networks", ["id"])
    op.add_column("service_centers", sa.Column("network_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_service_centers_network_id", "service_centers", "networks",
                          ["network_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_service_centers_network_id", "service_centers", ["network_id"])
    op.add_column("customers", sa.Column("registered_via", sa.String(16), nullable=False,
                                         server_default="workshop"))
    op.create_check_constraint("ck_customers_registered_via", "customers",
                               "registered_via IN ('workshop', 'self')")


def downgrade():
    op.drop_constraint("ck_customers_registered_via", "customers", type_="check")
    op.drop_column("customers", "registered_via")
    op.drop_index("ix_service_centers_network_id", table_name="service_centers")
    op.drop_constraint("fk_service_centers_network_id", "service_centers", type_="foreignkey")
    op.drop_column("service_centers", "network_id")
    op.drop_index("ix_networks_id", table_name="networks")
    op.drop_table("networks")
