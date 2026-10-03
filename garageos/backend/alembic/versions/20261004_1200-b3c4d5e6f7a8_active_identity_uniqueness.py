"""Protect active identities within each garage, including non-API writes.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def _create_identity_index(table, expression, predicate, name):
    # These identifiers/expressions are migration constants, never user input.
    # Keep writes out between the duplicate check and index creation. All DDL
    # runs in one transaction; a failed preflight changes no customer records.
    op.execute(f"LOCK TABLE {table} IN SHARE ROW EXCLUSIVE MODE")
    op.execute(sa.text(f"""
        DO $$
        DECLARE duplicate_groups integer;
        BEGIN
            SELECT count(*) INTO duplicate_groups FROM (
                SELECT 1 FROM {table} WHERE {predicate}
                GROUP BY service_center_id, {expression} HAVING count(*) > 1
            ) AS conflicts;
            IF duplicate_groups > 0 THEN
                RAISE EXCEPTION 'Cannot create {name}: % duplicate active identity groups in {table}. Resolve duplicates before retrying; no records were merged or deleted.', duplicate_groups;
            END IF;
        END $$;
    """))
    op.create_index(name, table, ["service_center_id", sa.text(expression)],
                    unique=True, postgresql_where=sa.text(predicate))


def upgrade():
    phone = r"regexp_replace(phone, '\D', '', 'g')"
    _create_identity_index("customers", phone, f"is_active = true AND {phone} <> ''",
                           "uq_customers_center_phone_active")
    for column, name in (("license_plate", "uq_vehicles_center_plate_active"),
                         ("vin", "uq_vehicles_center_vin_active")):
        expression = rf"upper(regexp_replace({column}, '[\s-]', '', 'g'))"
        _create_identity_index("vehicles", expression, f"is_active = true AND {expression} <> ''", name)


def downgrade():
    op.drop_index("uq_vehicles_center_vin_active", table_name="vehicles")
    op.drop_index("uq_vehicles_center_plate_active", table_name="vehicles")
    op.drop_index("uq_customers_center_phone_active", table_name="customers")
