"""Local reference lookups that preserve inactive historical relations."""
from sqlalchemy import select


def local_reference_exists(model, reference, service_center_id):
    return select(model.id).where(
        model.id == reference, model.service_center_id == service_center_id,
    ).exists()


async def local_reference(session, model, reference, service_center_id, *, active=False):
    stmt = select(model).where(model.id == reference, model.service_center_id == service_center_id)
    if active:
        stmt = stmt.where(model.is_active.is_(True))
    return await session.scalar(stmt)
