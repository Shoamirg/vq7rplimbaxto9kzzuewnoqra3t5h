"""Platform control center: the Platform → Network → Workshop tree and its access.

Only reachable through ``get_platform_operator`` (verified super admin, non-demo
token). Every write lands an ``AuditLog`` row in the same transaction, so the
control center's own actions show up in the logs it displays.
"""
from __future__ import annotations

import uuid

from fastapi import Request
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import client_ip
from app.core.security import hash_password
from app.exceptions import (
    NetworkNotFound, NetworkSlugUnavailable, ServiceCenterNotFound, StaffEmailUnavailable,
    StaffRoleUnavailable, UnauthorizedAction, UserNotFound, ValidationError, WorkshopEmailUnavailable,
)
from app.models import AuditLog, Customer, Network, Role, ServiceCenter, User
from app.schemas.platform import (
    NetworkCreate, NetworkUpdate, StaffAccessUpdate, WorkshopCreate, WorkshopUpdate,
)
from app.services.auth_session_service import AuthSessionService

AUDIT_PAGE_SIZE = 50


def _network(network: Network, workshops: list[dict]) -> dict:
    return {'id': network.id, 'name': network.name, 'slug': network.slug,
            'is_exclusive': network.is_exclusive, 'is_active': network.is_active, 'workshops': workshops}


def _workshop(center: ServiceCenter, staff: int = 0, customers: int = 0) -> dict:
    return {'id': center.id, 'name': center.name, 'email': center.email, 'phone': center.phone,
            'address': center.address, 'timezone': center.timezone, 'network_id': center.network_id,
            'is_active': center.is_active, 'staff_count': staff, 'customer_count': customers}


def _member(user: User) -> dict:
    return {'id': user.id, 'full_name': user.full_name, 'email': user.email, 'role': user.role.name,
            'is_active': user.is_active, 'is_super_admin': user.is_super_admin}


class PlatformControlService:
    def __init__(self, session: AsyncSession, actor: User, request: Request | None = None):
        self.session, self.actor, self.request = session, actor, request

    def _audit(self, action: str, *, resource_type: str, resource_id: uuid.UUID,
               center_id: uuid.UUID | None = None, fields: list[str] | None = None) -> None:
        self.session.add(AuditLog(
            action=action, service_center_id=center_id, actor_user_id=self.actor.id,
            actor_email=self.actor.email, resource_type=resource_type, resource_id=resource_id,
            ip=client_ip(self.request) if self.request else None,
            context={'fields': sorted(fields)} if fields else None))

    # ── Tree ────────────────────────────────────────────────────────────────
    async def _counts(self, model) -> dict[uuid.UUID, int]:
        rows = await self.session.execute(select(model.service_center_id, func.count())
                                          .where(model.is_active.is_(True)).group_by(model.service_center_id))
        return dict(rows.all())

    async def tree(self) -> dict:
        staff, customers = await self._counts(User), await self._counts(Customer)
        centers = (await self.session.scalars(select(ServiceCenter)
                   .order_by(ServiceCenter.name, ServiceCenter.id))).unique().all()
        networks = (await self.session.scalars(select(Network)
                    .order_by(Network.name, Network.id))).unique().all()
        by_network: dict[uuid.UUID | None, list[dict]] = {}
        for center in centers:
            node = _workshop(center, staff.get(center.id, 0), customers.get(center.id, 0))
            by_network.setdefault(center.network_id, []).append(node)
        return {'networks': [_network(n, by_network.get(n.id, [])) for n in networks],
                'independent': by_network.get(None, [])}

    # ── Networks ────────────────────────────────────────────────────────────
    async def _load_network(self, network_id: uuid.UUID, *, lock: bool = False) -> Network:
        query = select(Network).where(Network.id == network_id)
        network = await self.session.scalar(query.with_for_update() if lock else query)
        if network is None:
            raise NetworkNotFound()
        return network

    async def create_network(self, data: NetworkCreate) -> dict:
        network = Network(name=data.name, slug=data.slug, is_exclusive=data.is_exclusive, is_active=True)
        self.session.add(network)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise NetworkSlugUnavailable() from None
        self._audit('platform.network.create', resource_type='network', resource_id=network.id,
                    fields=['name', 'slug', 'is_exclusive'])
        return _network(network, [])

    async def update_network(self, network_id: uuid.UUID, data: NetworkUpdate) -> dict:
        network = await self._load_network(network_id, lock=True)
        for field in data.model_fields_set:
            setattr(network, field, getattr(data, field))
        self._audit('platform.network.update', resource_type='network', resource_id=network.id,
                    fields=list(data.model_fields_set))
        await self.session.flush()
        return _network(network, [])

    # ── Workshops ───────────────────────────────────────────────────────────
    async def _load_center(self, center_id: uuid.UUID) -> ServiceCenter:
        center = await self.session.scalar(select(ServiceCenter).where(ServiceCenter.id == center_id)
                                           .with_for_update(of=ServiceCenter))
        if center is None:
            raise ServiceCenterNotFound()
        return center

    async def _assignable_network(self, network_id: uuid.UUID | None) -> None:
        if network_id is not None and not (await self._load_network(network_id, lock=True)).is_active:
            raise ValidationError('Archived networks cannot receive workshops')

    async def create_workshop(self, data: WorkshopCreate) -> dict:
        await self._assignable_network(data.network_id)
        if not await self.session.scalar(text('SELECT 1 FROM pg_timezone_names WHERE name = :zone'),
                                         {'zone': data.timezone}):
            raise ValidationError('Unknown timezone; use a name such as Asia/Tashkent')
        email = str(data.email).lower() if data.email else None
        if email and await self.session.scalar(select(ServiceCenter.id)
                                               .where(func.lower(ServiceCenter.email) == email)):
            raise WorkshopEmailUnavailable()
        admin_email = str(data.admin.email).lower()
        if await self.session.scalar(select(User.id).where(func.lower(User.email) == admin_email)):
            raise StaffEmailUnavailable()
        role = await self.session.scalar(select(Role).where(Role.name == 'admin', Role.is_active.is_(True)))
        if role is None:
            raise StaffRoleUnavailable()
        center = ServiceCenter(name=data.name, email=email, phone=data.phone, address=data.address,
                               timezone=data.timezone, network_id=data.network_id, is_active=True)
        self.session.add(center)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise WorkshopEmailUnavailable() from None
        admin = User(service_center_id=center.id, role_id=role.id, full_name=data.admin.full_name,
                     email=admin_email, password_hash=hash_password(data.admin.password),
                     is_super_admin=False, is_active=True)
        self.session.add(admin)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise StaffEmailUnavailable() from None
        self._audit('platform.workshop.create', resource_type='service_center', resource_id=center.id,
                    center_id=center.id, fields=['name', 'email', 'network_id', 'timezone'])
        self._audit('platform.staff.create', resource_type='user', resource_id=admin.id,
                    center_id=center.id, fields=['full_name', 'email', 'role'])
        return _workshop(center, staff=1)

    async def update_workshop(self, center_id: uuid.UUID, data: WorkshopUpdate) -> dict:
        center = await self._load_center(center_id)
        if 'network_id' in data.model_fields_set and data.network_id != center.network_id:
            await self._assignable_network(data.network_id)
        # Suspending the operator's own anchoring workshop would sign them out for good.
        if data.is_active is False and center.id == self.actor.service_center_id:
            raise UnauthorizedAction()
        for field in data.model_fields_set:
            setattr(center, field, getattr(data, field))
        self._audit('platform.workshop.update', resource_type='service_center', resource_id=center.id,
                    center_id=center.id, fields=list(data.model_fields_set))
        await self.session.flush()
        return _workshop(center)

    # ── Staff access ────────────────────────────────────────────────────────
    async def staff(self, center_id: uuid.UUID) -> list[dict]:
        if await self.session.get(ServiceCenter, center_id) is None:
            raise ServiceCenterNotFound()
        users = (await self.session.scalars(select(User).where(User.service_center_id == center_id)
                 .order_by(User.full_name, User.id))).unique().all()
        return [_member(user) for user in users]

    async def update_staff(self, user_id: uuid.UUID, data: StaffAccessUpdate) -> dict:
        user = await self.session.scalar(select(User).where(User.id == user_id).with_for_update(of=User))
        if user is None:
            raise UserNotFound()
        # Platform operators are managed only through the enrollment CLI, never here.
        if user.id == self.actor.id or user.is_super_admin or user.role.name == 'super_admin':
            raise UnauthorizedAction()
        if data.role is not None:
            role = await self.session.scalar(select(Role).where(Role.name == data.role, Role.is_active.is_(True)))
            if role is None:
                raise StaffRoleUnavailable()
            user.role_id, user.role = role.id, role
        if data.is_active is not None:
            user.is_active = data.is_active
            if not data.is_active:
                await AuthSessionService(self.session).revoke_principal('staff', user.id)
        self._audit('platform.staff.update', resource_type='user', resource_id=user.id,
                    center_id=user.service_center_id, fields=list(data.model_fields_set))
        await self.session.flush()
        return _member(user)

    # ── Logs ────────────────────────────────────────────────────────────────
    async def audit_log(self, *, page: int, center_id: uuid.UUID | None, network_id: uuid.UUID | None,
                        action: str) -> dict:
        query = (select(AuditLog, ServiceCenter.name.label('garage'))
                 .outerjoin(ServiceCenter, ServiceCenter.id == AuditLog.service_center_id))
        if center_id:
            query = query.where(AuditLog.service_center_id == center_id)
        if network_id:
            query = query.where(or_(ServiceCenter.network_id == network_id, and_(
                AuditLog.resource_type == 'network', AuditLog.resource_id == network_id)))
        if action.strip():
            literal = action.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            query = query.where(AuditLog.action.ilike(f'{literal}%', escape='\\'))
        total = await self.session.scalar(select(func.count()).select_from(query.subquery()))
        rows = (await self.session.execute(query.order_by(AuditLog.created_at.desc(), AuditLog.id)
                .offset((page - 1) * AUDIT_PAGE_SIZE).limit(AUDIT_PAGE_SIZE))).all()
        return {'total': total, 'page': page, 'page_size': AUDIT_PAGE_SIZE, 'items': [{
            'id': log.id, 'created_at': log.created_at, 'action': log.action, 'status': log.status,
            'service_center_id': log.service_center_id, 'garage': garage, 'actor_email': log.actor_email,
            'resource_type': log.resource_type, 'ip': log.ip,
        } for log, garage in rows]}
