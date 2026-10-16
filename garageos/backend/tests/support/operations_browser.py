"""Owned Operations identities/legacy rows; browser_release guards the caller."""
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from app.core.security import hash_password
from app.models import Customer, Role, User
from app.models.operational_case import OperationalCase


async def create_operations_profiles(session, issuers):
    role = await session.scalar(select(Role).where(Role.name == "mechanic"))
    if role is None:
        raise ValueError("Seed the isolated mechanic role first")
    profiles = []
    for issuer in issuers:
        center = uuid.UUID(issuer["center_id"])
        prefix = uuid.uuid4().hex[:30]
        duplicate_name = "QA37 Sherzod <literal> & Шерзод"
        users = []
        for i in range(7):
            identifier = uuid.UUID(hex=prefix + f"{i:02x}")
            user = User(id=identifier, service_center_id=center, role_id=role.id,
                        full_name=duplicate_name if i < 2 else f"QA37 roster mechanic {i}",
                        email=f"operations-{identifier.hex}@example.com",
                        password_hash=hash_password("QA-only-" + secrets.token_urlsafe(24)))
            session.add(user)
            users.append(user)
        customer = Customer(service_center_id=center, full_name="QA37 O‘tkir <literal> & Очень длинное имя")
        session.add(customer)
        await session.flush()
        case = OperationalCase(service_center_id=center, customer_id=customer.id,
            code=f"QA37-{prefix[:8]}", title="QA37 legacy <literal> & O‘tkir Русский " + "long-unbroken-" * 10,
            case_type="legacy_kind", status="legacy_pending", severity="legacy_priority",
            location_text="QA saved location <literal> & Русский", location_lat=0, location_lng=0,
            sla_response_minutes=0, created_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
        session.add(case)
        await session.flush()
        profiles.append(dict(center_id=str(center), duplicate_name=duplicate_name,
            duplicate_ids=[str(user.id) for user in users[:2]], all_ids=[str(user.id) for user in users],
            legacy_id=str(case.id), legacy_title=case.title, legacy_code=case.code,
            legacy_customer=customer.full_name))
    await session.commit()
    return profiles
