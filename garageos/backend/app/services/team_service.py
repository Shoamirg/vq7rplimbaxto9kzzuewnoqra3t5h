"""Workshop team views backed by the current owner-managed staff policy."""
import secrets
import uuid

from sqlalchemy import or_, select

from app.exceptions import UserNotFound, ValidationError
from app.models import MaintenanceRule, Role, User
from app.schemas.staff import StaffCreate, StaffUpdate
from app.services.staff_service import StaffService


class TeamService:
    def __init__(self, uow, actor):
        self.uow, self.actor = uow, actor
        self.staff = StaffService(uow, actor)

    async def mechanics(self):
        users = (await self.uow.session.scalars(select(User).join(Role).where(
            User.service_center_id == self.uow.service_center_id,
            User.is_active.is_(True), Role.is_active.is_(True), Role.name == 'mechanic',
        ).order_by(User.full_name, User.id))).all()
        return [self.master(user) for user in users]

    @staticmethod
    def master(user):
        return {'id': str(user.id), 'name': user.full_name, 'phone': user.phone,
                'service_types': user.service_types or []}

    async def catalog(self):
        return list((await self.uow.session.scalars(select(MaintenanceRule.service_type)
                    .where(MaintenanceRule.is_active.is_(True), or_(
                        MaintenanceRule.service_center_id == self.uow.service_center_id,
                        MaintenanceRule.service_center_id.is_(None),
                    )).distinct()
                    .order_by(MaintenanceRule.service_type))).all())

    async def mechanic(self, user_id):
        user = await self.uow.session.scalar(select(User).join(Role).where(
            User.id == user_id, User.service_center_id == self.uow.service_center_id,
            User.is_active.is_(True), Role.is_active.is_(True), Role.name == 'mechanic',
        ).with_for_update(of=User))
        if user is None:
            raise UserNotFound()
        return user

    async def set_services(self, user_id, services):
        user = await self.mechanic(user_id)
        catalog = set(await self.catalog())
        if any(service not in catalog for service in services):
            raise ValidationError()
        user.service_types = list(dict.fromkeys(services))
        self.staff.audit('staff.services.update', user, ['service_types'])
        await self.uow.flush()
        return self.master(user)

    async def add_mechanic(self, name, phone):
        # A scheduling-only identity gets an unguessable password. Owners create
        # employee login credentials through the existing Staff Accounts form.
        result = await self.staff.create(StaffCreate(
            full_name=name, phone=phone, role='mechanic',
            email=f'master.{uuid.uuid4().hex}@garageos.app',
            password=secrets.token_urlsafe(32),
        ))
        return self.master(await self.mechanic(uuid.UUID(result['id'])))

    async def remove_mechanic(self, user_id):
        await self.mechanic(user_id)
        await self.staff.update(user_id, StaffUpdate(is_active=False))
