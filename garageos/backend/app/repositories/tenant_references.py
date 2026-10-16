"""Local reference lookups that preserve inactive historical relations."""
from sqlalchemy import select


def local_reference_exists(model, reference, service_center_id):
    # A list projection may join this same reference table. Keep its FROM inside
    # EXISTS so SQLAlchemy only correlates the owning record, never this table.
    return select(model.id).where(
        model.id == reference, model.service_center_id == service_center_id,
    ).correlate_except(model).exists()


async def local_reference(session, model, reference, service_center_id, *, active=False):
    stmt = select(model).where(model.id == reference, model.service_center_id == service_center_id)
    if active:
        stmt = stmt.where(model.is_active.is_(True))
    return await session.scalar(stmt)
