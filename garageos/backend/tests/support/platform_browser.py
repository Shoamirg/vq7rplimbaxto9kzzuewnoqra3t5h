"""Explicit privileged fixture for the isolated browser test database only."""
import asyncio
from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import Role, User


async def main():
    url = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT != 'test' or url.host not in {'localhost', '127.0.0.1'} or url.database != 'garage_test':
        raise RuntimeError('Platform browser fixture requires isolated loopback garage_test with ENVIRONMENT=test')
    try:
        async with async_session_factory() as session:
            center = await session.scalar(select(User.service_center_id).where(User.email == 'admin@demo.garageos.app'))
            role = await session.scalar(select(Role.id).where(Role.name == 'super_admin', Role.is_active.is_(True)))
            if not center or not role:
                raise RuntimeError('Seed the isolated demo database first')
            existing = await session.scalar(select(User.id).where(User.email == 'platform-browser@example.com'))
            if existing:
                raise RuntimeError('Refusing to overwrite an existing fixture account')
            session.add(User(service_center_id=center, role_id=role, email='platform-browser@example.com',
                             full_name='Platform browser operator', is_super_admin=True,
                             password_hash=hash_password('Platform-browser-only-2026!')))
            await session.commit()
    finally:
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
