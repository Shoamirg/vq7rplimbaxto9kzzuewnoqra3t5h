"""Owned synthetic documents shared by real HTTP and isolated browser QA."""
from datetime import date, datetime, timezone
from decimal import Decimal
import secrets
import uuid

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.models import Customer, Role, ServiceCenter, User
from app.models.invoice import Invoice, InvoiceLineItem


class PrivateProfile(dict):
    """JSON keeps the private fixture fields; failure repr never prints them."""

    def __repr__(self):
        return "<owned synthetic issuer profile>"


async def create_profiles(session):
    role = await session.scalar(select(Role).where(Role.name == "admin"))
    if role is None:
        raise ValueError("Seed the isolated admin role first")
    profiles = []
    tag = uuid.uuid4().hex
    for index in range(2):
        name = "Chinor & O‘g‘illari <Avtoservis>" if index == 0 else "Саховат Автосервис"
        expected = {
            "name": name, "tagline": "Ishonch · Забота & service" if index == 0 else None,
            "monogram": "CH" if index == 0 else "СА",
            "phone": "031" if index == 0 else None,  # Short QA-only business contact exercises target width.
            "address": "QA Toshkent, O‘rikzor <31> & xizmat ko‘chasi" if index == 0 else None,
        }
        center = ServiceCenter(
            name=f"Issuer QA legal {tag}" if index == 0 else name,
            brand_name=name if index == 0 else None, tagline=expected["tagline"],
            monogram=expected["monogram"] if index == 0 else None,
            phone=expected["phone"], address=expected["address"],
            email=f"private-issuer-{tag}-{index}@example.invalid",
            slug=f"issuer-qa-{tag}-{index}", timezone="Asia/Tashkent",
        )
        session.add(center)
        await session.flush()
        password = "QA-only-" + secrets.token_urlsafe(24)
        user = User(service_center_id=center.id, role_id=role.id,
                    email=f"issuer-{tag}-{index}@example.com", full_name="QA issuer staff",
                    password_hash=hash_password(password), is_super_admin=False)
        customer = Customer(service_center_id=center.id, full_name="QA mijoz <Chinor> & Клиент",
                            phone="+998900000099", email="customer-only@example.invalid")
        session.add_all([user, customer])
        await session.flush()
        documents = []
        for kind in ["invoice", "estimate"]:
            doc = Invoice(service_center_id=center.id, customer_id=customer.id,
                          code=f"QA31-{tag[:8]}-{index}-{kind[:3]}", kind=kind,
                          status="issued" if kind == "invoice" else "sent", currency="UZS",
                          subtotal=Decimal("185185.18"), tax_rate=Decimal("12.50"),
                          tax_total=Decimal("23148.15"), total=Decimal("208333.33"),
                          balance=Decimal("208333.33"), amount_paid=0,
                          created_at=datetime(2026, 8, 10, 23, 30, tzinfo=timezone.utc),
                          issued_at=datetime(2026, 8, 10, 23, 30, tzinfo=timezone.utc),
                          due_date=date(2026, 8, 15))
            session.add(doc)
            await session.flush()
            session.add(InvoiceLineItem(service_center_id=center.id, invoice_id=doc.id,
                                       kind="labor", description="QA xizmat <tekshiruv> & Работа",
                                       quantity=Decimal("1.50"), unit_price=Decimal("123456.79"),
                                       line_total=Decimal("185185.18")))
            documents.append({"id": str(doc.id), "kind": kind, "code": doc.code})
        profiles.append(PrivateProfile(center_id=str(center.id), email=user.email,
                                       password=password, issuer=expected, documents=documents))
    await session.commit()
    return profiles


async def remove_profiles(session, profiles):
    """Only remove IDs returned by this fixture; cascade owns its documents."""
    for profile in profiles:
        await session.execute(delete(ServiceCenter).where(ServiceCenter.id == uuid.UUID(profile["center_id"])))
    await session.commit()
