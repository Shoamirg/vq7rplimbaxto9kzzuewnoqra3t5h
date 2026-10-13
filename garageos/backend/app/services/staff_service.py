"""Owner-managed employee identities, always scoped to the owner's garage."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.exceptions import StaffEmailUnavailable, StaffRoleUnavailable, UnauthorizedAction, UserNotFound
from app.models import Role, User
from app.models.audit_log import AuditLog
from app.schemas.staff import StaffCreate, StaffUpdate


def protected(user):
    return user.is_super_admin or user.role.name not in {'mechanic', 'manager', 'receptionist'}


def summary(user):
    return {'id': str(user.id), 'full_name': user.full_name, 'email': user.email,
            'phone': user.phone, 'role': user.role.name, 'is_active': user.is_active,
            'editable': not protected(user)}


class StaffService:
    def __init__(self, uow, actor):
        self.uow, self.actor = uow, actor

    async def list(self, query, page, page_size):
        conditions = [User.service_center_id == self.uow.service_center_id]
        if query.strip():
            escaped = query.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            conditions.append(or_(User.full_name.ilike(f'%{escaped}%', escape='\\'),
                                  User.email.ilike(f'%{escaped}%', escape='\\')))
        total = await self.uow.session.scalar(select(func.count()).select_from(User).where(*conditions))
        users = (await self.uow.session.scalars(select(User).where(*conditions)
                 .order_by(User.full_name, User.id).offset((page - 1) * page_size).limit(page_size))).all()
        return {'items': [summary(u) for u in users], 'total': total, 'page': page,
                'page_size': page_size, 'total_pages': (total + page_size - 1) // page_size}

    async def employee_role(self, name):
        role = await self.uow.session.scalar(select(Role).where(Role.name == name, Role.is_active.is_(True)))
        if role is None:
            raise StaffRoleUnavailable()
        return role

    def audit(self, action, user, fields):
        self.uow.session.add(AuditLog(service_center_id=self.uow.service_center_id,
            actor_user_id=self.actor.id, actor_email=self.actor.email, action=action,
            resource_type='user', resource_id=user.id, context={'fields': fields}))

    async def create(self, data: StaffCreate):
        role = await self.employee_role(data.role)
        user = User(service_center_id=self.uow.service_center_id,
                    full_name=data.full_name, email=str(data.email), phone=data.phone,
                    password_hash=hash_password(data.password), role_id=role.id,
                    is_super_admin=False, is_active=True)
        user.role = role
        self.uow.session.add(user)
        try:
            await self.uow.flush()
        except IntegrityError:
            await self.uow.rollback()
            raise StaffEmailUnavailable() from None
        self.audit('staff.create', user, ['full_name', 'email', 'phone', 'role'])
        return summary(user)

    async def update(self, user_id: uuid.UUID, data: StaffUpdate):
        user = await self.uow.session.scalar(select(User).where(
            User.id == user_id, User.service_center_id == self.uow.service_center_id,
        ).with_for_update(of=User))
        if not user:
            raise UserNotFound()
        if user.id == self.actor.id or protected(user):
            raise UnauthorizedAction()
        if 'role' in data.model_fields_set:
            role = await self.employee_role(data.role)
            user.role_id, user.role = role.id, role
        for field in ('full_name', 'phone', 'is_active'):
            if field in data.model_fields_set:
                setattr(user, field, getattr(data, field))
        if 'is_active' in data.model_fields_set and not data.is_active:
            from app.services.auth_session_service import AuthSessionService
            await AuthSessionService(self.uow.session).revoke_principal("staff", user.id)
        self.audit('staff.update', user, sorted(data.model_fields_set))
        await self.uow.flush()
        return summary(user)
