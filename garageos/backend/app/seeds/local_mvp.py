"""Small, repeatable synthetic fixture, restricted to the dedicated local DB.

Prints JSON for the ignored local test harness; never run against a deployment.
"""
from __future__ import annotations

import asyncio
import json
import secrets
from sqlalchemy import select
from sqlalchemy.engine import make_url
from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import Customer, User, Vehicle
from app.models.customer_account import CustomerAccount
from app.seeds.roles import seed_roles
from app.seeds.brands import seed_brands
from app.seeds.models import seed_vehicle_models
from app.seeds.service_centers import seed_service_center
from app.seeds.maintenance_rules import seed_maintenance_rules
from app.services.conversation_service import ConversationService
from app.repositories.unit_of_work import UnitOfWork


async def main():
    if (settings.ENVIRONMENT != 'development' or
            make_url(settings.DATABASE_URL).database != 'garageos_mvp_local'):
        raise RuntimeError('Local MVP seeding requires the isolated development database')
    password = secrets.token_urlsafe(18)
    fixture = {'password': password, 'api_url': 'http://127.0.0.1:8000/api/v1', 'tenants': []}
    async with async_session_factory() as session:
        roles = await seed_roles(session)
        brands = await seed_brands(session)
        models = await seed_vehicle_models(session, brands)
        model = next((m for m in models if m.name.lower() == 'cobalt'), models[0])
        for index, suffix in enumerate(('a', 'b')):
            center = await seed_service_center(session, name=f'GarageOS Sinov {suffix.upper()}',
                email=f'garage.{suffix}@example.com', phone=f'+99890000900{index}',
                timezone='Asia/Tashkent', address='Toshkent — sun’iy sinov servisi',
                brand_name=f'GarageOS Sinov {suffix.upper()}', slug=f'mvp-local-{suffix}')
            await seed_maintenance_rules(session, center, brands)
            people = {}
            for key, role in [('owner', 'admin'), ('reception', 'receptionist'), ('mechanic', 'mechanic')]:
                email = f'{key}.{suffix}@example.com'
                user = await session.scalar(select(User).where(User.email == email))
                if user is None:
                    user = User(email=email, full_name=f'Sinov {key} {suffix.upper()}',
                        service_center_id=center.id, role_id=roles[role].id,
                        password_hash=hash_password(password), is_super_admin=False)
                    session.add(user)
                else:
                    user.password_hash = hash_password(password)
                await session.flush()
                people[key] = {'id': str(user.id), 'email': email}
            email = f'customer.{suffix}@example.com'
            customer = await session.scalar(select(Customer).where(
                Customer.service_center_id == center.id, Customer.email == email))
            if customer is None:
                customer = Customer(service_center_id=center.id, full_name=f'Sinov Mijoz {suffix.upper()}',
                    email=email, phone=f'+99890000800{index}')
                session.add(customer)
                await session.flush()
            account = await session.scalar(select(CustomerAccount).where(CustomerAccount.customer_id == customer.id))
            if account is None:
                account = CustomerAccount(service_center_id=center.id, customer_id=customer.id,
                    email=email, password_hash=hash_password(password))
                session.add(account)
            else:
                account.password_hash = hash_password(password)
            plate = f'01 Q 00{index + 1} QA'
            vehicle = await session.scalar(select(Vehicle).where(
                Vehicle.service_center_id == center.id, Vehicle.license_plate == plate))
            if vehicle is None:
                vehicle = Vehicle(service_center_id=center.id, customer_id=customer.id,
                    vehicle_model_id=model.id, year=2023, license_plate=plate, current_km=45000)
                session.add(vehicle)
                await session.flush()
            fixture['tenants'].append({'id': str(center.id), **people,
                'customer': {'id': str(customer.id), 'email': email, 'phone': customer.phone},
                'vehicle_id': str(vehicle.id)})
        await session.commit()
    for tenant in fixture['tenants']:
        async with UnitOfWork(service_center_id=__import__('uuid').UUID(tenant['id'])) as uow:
            from app.models.conversation import Conversation
            existing = await uow.session.scalar(select(Conversation.id).where(
                Conversation.service_center_id == uow.service_center_id,
                Conversation.subject == 'MVP sinov suhbat'))
            if existing is None:
                conv = await ConversationService(uow).create_conversation(subject='MVP sinov suhbat',
                    customer_id=__import__('uuid').UUID(tenant['customer']['id']),
                    vehicle_id=__import__('uuid').UUID(tenant['vehicle_id']))
                existing = conv['id']
            tenant['thread_id'] = str(existing)
    print(json.dumps(fixture, ensure_ascii=False))
    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
