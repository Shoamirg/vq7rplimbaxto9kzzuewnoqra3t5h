"""Create isolated Flutter smoke accounts in a loopback garage_test DB only.

Run from garageos/backend with the venv, passing an output JSON path. Uses
existing migrations/catalog and never resets data or changes existing users.
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import Brand, Customer, Role, ServiceCenter, User, VehicleModel


async def seed(output: Path):
    url = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT != "test" or url.database != "garage_test" or url.host not in {"127.0.0.1", "localhost"}:
        raise SystemExit("Smoke fixtures require ENVIRONMENT=test and a loopback garage_test database")
    tag = uuid.uuid4().hex[:12]
    email, password = f"flutter-{tag}@example.com", "Flutter-Test-Only-2026!"
    async with async_session_factory() as session:
        role = await session.scalar(select(Role).where(Role.name == "admin"))
        if role is None:
            role = Role(name="admin")
            session.add(role)
            await session.flush()
        a = ServiceCenter(name="Flutter QA Turon", email=f"flutter-a-{tag}@example.com")
        b = ServiceCenter(name="Flutter QA other tenant", email=f"flutter-b-{tag}@example.com")
        session.add_all([a, b])
        await session.flush()
        session.add(User(email=email, password_hash=hash_password(password), full_name="Flutter QA xodim",
                         role_id=role.id, service_center_id=a.id, is_super_admin=False))
        other = Customer(service_center_id=b.id, full_name="Other tenant customer", phone="+998900001111")
        session.add(other)
        # Fresh test databases need one valid catalog model for vehicle intake.
        model = await session.scalar(select(VehicleModel).where(VehicleModel.is_active.is_(True)).limit(1))
        if model is None:
            brand = Brand(name=f"Flutter smoke {tag}")
            session.add(brand)
            await session.flush()
            session.add(VehicleModel(brand_id=brand.id, name="Test car", year_start=2010))
        await session.flush()
        await session.commit()
        output.write_text(json.dumps({"email": email, "password": password,
                                      "other_customer_id": str(other.id)}, indent=2), encoding="utf-8")
    await engine.dispose()
    print("Created isolated Flutter API smoke fixture")


if __name__ == "__main__":
    asyncio.run(seed(Path(sys.argv[1])))
