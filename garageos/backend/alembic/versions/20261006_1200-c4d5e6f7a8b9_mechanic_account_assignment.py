"""Link explicit mechanic assignments without guessing legacy name ownership."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c4d5e6f7a8b9"
down_revision = "e1bdd605818c"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("appointments", sa.Column("mechanic_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_appointments_mechanic_user", "appointments", "users", ["mechanic_user_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_appointments_center_mechanic", "appointments", ["service_center_id", "mechanic_user_id"])


def downgrade():
    op.drop_index("ix_appointments_center_mechanic", table_name="appointments")
    op.drop_constraint("fk_appointments_mechanic_user", "appointments", type_="foreignkey")
    op.drop_column("appointments", "mechanic_user_id")
