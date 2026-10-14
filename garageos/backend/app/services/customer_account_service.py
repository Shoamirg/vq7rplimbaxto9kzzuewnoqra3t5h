from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models import Customer, AuditLog
from app.models.customer_account import CustomerAccount
from app.core.security import hash_password
from app.exceptions import NotFoundError, StaffEmailUnavailable


class CustomerAccountService:
    def __init__(self, uow, actor):
        self.uow, self.actor = uow, actor

    async def customer(self, customer_id):
        customer = await self.uow.session.scalar(select(Customer).where(
            Customer.id == customer_id, Customer.service_center_id == self.uow.service_center_id,
            Customer.is_active.is_(True)).with_for_update(of=Customer))
        if not customer: raise NotFoundError('Customer not found')
        return customer

    async def account(self, customer_id):
        await self.customer(customer_id)
        return await self.uow.session.scalar(select(CustomerAccount).where(
            CustomerAccount.customer_id == customer_id,
            CustomerAccount.service_center_id == self.uow.service_center_id).with_for_update())

    @staticmethod
    def summary(account):
        return None if account is None else {'email':account.email,'is_active':account.is_active}

    async def create(self, customer_id, data):
        if await self.account(customer_id): raise StaffEmailUnavailable()
        account = CustomerAccount(customer_id=customer_id,service_center_id=self.uow.service_center_id,
                                  email=str(data.email).lower(),password_hash=hash_password(data.password))
        self.uow.session.add(account)
        try: await self.uow.flush()
        except IntegrityError:
            await self.uow.rollback()
            raise StaffEmailUnavailable() from None
        self.audit(customer_id,'customer.account.create')
        return self.summary(account)

    async def update(self, customer_id, data):
        account = await self.account(customer_id)
        if not account: raise NotFoundError('Customer account not found')
        if account.is_active != data.is_active:
            account.is_active = data.is_active
            account.version += 1
            if not data.is_active:
                from app.services.auth_session_service import AuthSessionService
                await AuthSessionService(self.uow.session).revoke_principal("customer", account.customer_id,
                    customer_account_id=account.id)
            self.audit(customer_id,'customer.account.access')
            await self.uow.flush()
        return self.summary(account)

    def audit(self, customer_id, action):
        self.uow.session.add(AuditLog(service_center_id=self.uow.service_center_id,
            actor_user_id=self.actor.id, action=action, resource_type='customer',resource_id=customer_id,
            context={'fields':['access']}))
