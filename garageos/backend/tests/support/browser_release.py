"""Write synthetic signed Mini App launch data for the complete browser gate.

The bot key stays in the caller's environment. This command also creates owned
synthetic issuer documents/staff in the isolated test database and provisions a
normal synthetic password account for the existing Telegram customer. It never
creates or promotes a Telegram identity or creates a new customer entity.
"""
import argparse
import asyncio
import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path
import sys
import time
from urllib.parse import urlencode, urlsplit


async def prepare_password_customer(customer_id: str, center_id: str) -> dict:
    """Normal read-only password credentials for the existing synthetic TG user.

    Private QA fixture only: it neither creates a Telegram identity nor changes
    the password-customer messaging policy. Browser tests can observe a genuine
    same-customer403 instead of fabricating a denial response.
    """
    import uuid
    from sqlalchemy.engine import make_url
    from app.core.config import settings
    from app.core.staff_access import staff_permissions
    from app.repositories.unit_of_work import UnitOfWork
    from app.schemas.customer_account import CustomerAccountCreate
    from app.services.auth_service import AuthService
    from app.services.customer_account_service import CustomerAccountService
    from app.services.customer_auth_service import CustomerAuthService
    from app.seeds.mechanics import DEFAULT_PASSWORD

    url = make_url(settings.DATABASE_URL)
    if (settings.ENVIRONMENT != 'test' or settings.DEBUG
            or url.host not in {'localhost', '127.0.0.1'} or url.database != 'garage_test'):
        raise ValueError('Refused non-isolated password browser fixture')
    customer_uuid, center_uuid = uuid.UUID(customer_id), uuid.UUID(center_id)
    async with UnitOfWork() as auth_uow:
        auth = AuthService(auth_uow)
        tokens = await auth.login('admin@demo.garageos.app', DEFAULT_PASSWORD)
        owner = await auth.get_current_user(tokens['access_token'])
        if (owner.service_center_id != center_uuid or owner.role.name != 'admin'
                or 'staff.write' not in staff_permissions(owner)):
            raise ValueError('Synthetic owner does not own this customer')
        async with UnitOfWork(service_center_id=center_uuid) as uow:
            service = CustomerAccountService(uow, owner)
            customer = await service.customer(customer_uuid)
            if customer.telegram_id is None or await service.account(customer_uuid) is not None:
                raise ValueError('Refused unexpected synthetic password account')
            profile = {'email': f'qa38-policy-{uuid.uuid4()}@example.com',
                       'password': secrets.token_urlsafe(32),
                       'customer_id': customer_id, 'center_id': center_id}
            await service.create(customer_uuid, CustomerAccountCreate(
                email=profile['email'], password=profile['password']))
            verified = await CustomerAuthService(uow).authenticate_password(
                profile['email'], profile['password'])
            if str(verified['customer']['id']) != customer_id:
                raise ValueError('Synthetic password identity mismatch')
        return profile


async def prepare(output: Path) -> None:
    from sqlalchemy import func, select
    from sqlalchemy.engine import make_url
    from app.core.config import settings
    from app.core.database import async_session_factory, engine
    from app.models import Customer, ServiceCenter, Vehicle

    try:
        url = make_url(settings.DATABASE_URL)
        origin = os.environ.get('BASE_URL', '')
        target = urlsplit(origin)
        token = settings.TELEGRAM_BOT_TOKEN or ''
        repo = Path(__file__).resolve().parents[4]
        output = output.resolve()
        if (settings.ENVIRONMENT != 'test' or settings.DEBUG
                or url.host not in {'localhost', '127.0.0.1'} or url.database != 'garage_test'
                or not token.startswith('GARAGEOS_QA_BROWSER_') or len(token) < 40
                or target.scheme != 'http' or target.hostname not in {'localhost', '127.0.0.1'}
                or target.username or target.password or target.path or target.query or target.fragment
                or output.is_relative_to(repo) or output.name != 'browser-fixture.json'
                or not output.parent.is_dir() or output.exists()):
            raise ValueError('Refused non-isolated browser fixture setup')
        async with async_session_factory() as session:
            customer = (await session.execute(select(Customer.id, Customer.service_center_id,
                Customer.telegram_id, Customer.telegram_username).join(ServiceCenter,
                    ServiceCenter.id == Customer.service_center_id).join(Vehicle,
                    (Vehicle.customer_id == Customer.id) & (Vehicle.service_center_id == Customer.service_center_id))
                .where(ServiceCenter.email == 'demo@garageos.app', ServiceCenter.is_active.is_(True),
                       Customer.is_active.is_(True), Customer.telegram_id.is_not(None), Vehicle.is_active.is_(True))
                .group_by(Customer.id).order_by(func.count(Vehicle.id).desc(), Customer.id).limit(1))).mappings().first()
            if customer is None:
                raise ValueError('Seed the isolated demo customer and vehicles first')
        fields = {'auth_date':str(int(time.time())), 'user':json.dumps({
            'id':customer['telegram_id'], 'username':customer['telegram_username'],
            'first_name':'Synthetic browser customer'}, separators=(',', ':'))}
        key = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
        fields['hash'] = hmac.new(key, '\n'.join(f'{key}={fields[key]}' for key in sorted(fields)).encode(), hashlib.sha256).hexdigest()
        receipt = {'qa_only':True, 'base_origin':origin, 'init_data':urlencode(fields),
                   'customer_id':str(customer['id']), 'service_center_id':str(customer['service_center_id'])}
        receipt['password_customer'] = await prepare_password_customer(
            receipt['customer_id'], receipt['service_center_id'])
        # Exclusive creation refuses an existing private file; Linux mode0600.
        fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            from tests.support.document_issuer import create_profiles
            from tests.support.calendar_browser import create_calendar_profiles
            from tests.support.queue_browser import create_queue_profiles
            from tests.support.operations_browser import create_operations_profiles
            async with async_session_factory() as session:
                receipt['issuer_profiles'] = await create_profiles(session)
                receipt['calendar_profiles'] = await create_calendar_profiles(session, receipt['issuer_profiles'])
                receipt['queue_profiles'] = await create_queue_profiles(session, receipt['issuer_profiles'])
                receipt['operations_profiles'] = await create_operations_profiles(session, receipt['issuer_profiles'])
                # Trusted QA authentication seam: mint with the SAME service as
                # /auth/demo, without enabling its disabled public entry route.
                # Only live read-only auth/me/UoW/demo policy is exercised with
                # this private HttpOnly cookie; no production/demo enrollment.
                from app.api.deps import _auth_service
                receipt['operations_demo_token'] = (await _auth_service(session).demo_login())['access_token']
            json.dump(receipt, file)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        asyncio.run(prepare(args.output))
    except Exception:
        print('Browser fixture refused or failed; use the documented isolated QA setup and private output path.', file=sys.stderr)
        raise SystemExit(2) from None
    print('Private synthetic browser fixture prepared; do not archive it.')


if __name__ == '__main__':
    main()
