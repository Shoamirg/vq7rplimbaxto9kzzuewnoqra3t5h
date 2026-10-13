"""Retained authority for acknowledging only observed shared unread state.

ConversationService holds the refreshed safe aggregate lock through this work
and the normal UnitOfWork commit. No observation grants authentication or policy.
"""
import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import contains_eager

from app.core.staff_access import staff_permissions
from app.exceptions import InvalidToken, UnauthorizedAction, ValidationError
from app.models.conversation import Conversation
from app.models.conversation_read_observation import ConversationReadObservation
from app.models.role import Role
from app.models.service_center import ServiceCenter
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_session_service import AuthSessionService

OBSERVATION_TTL = timedelta(hours=24)
PRUNE_BATCH_SIZE = 100


class ConversationObservationInvalid(ValidationError):
    code = "CONVERSATION_READ_OBSERVATION_INVALID"
    detail = "Read this conversation again before acknowledging it"


async def prune_expired_observations(session, service_center_id: uuid.UUID) -> int:
    """One indexed tenant batch; another transaction's locked rows are skipped."""
    # Bind one real database cutoff. A volatile per-row clock cannot supply an
    # expiry range index condition, even when LIMIT bounds the deleted rows.
    cutoff = await session.scalar(select(func.clock_timestamp()))
    expired = select(ConversationReadObservation.id).where(
        ConversationReadObservation.service_center_id == service_center_id,
        ConversationReadObservation.expires_at <= cutoff,
    ).order_by(ConversationReadObservation.expires_at, ConversationReadObservation.id
    ).limit(PRUNE_BATCH_SIZE).with_for_update(skip_locked=True
    ).cte("expired_observation_batch").prefix_with("MATERIALIZED", dialect="postgresql")
    # Freeze the locked batch once. Re-evaluating a locking subquery during a
    # DELETE can skip its own previously locked rows and exceed the batch limit.
    deleted = await session.scalars(delete(ConversationReadObservation).where(
        ConversationReadObservation.service_center_id == service_center_id,
        ConversationReadObservation.id.in_(select(expired.c.id)),
    ).returning(ConversationReadObservation.id))
    return len(list(deleted))


class ConversationReadService:
    def __init__(self, uow: UnitOfWork):
        self.session = uow.session
        self.sc = uow.service_center_id

    async def _actor(self, actor_id: uuid.UUID, permission: str) -> None:
        # Pin current staff/role/garage eligibility through commit, including
        # a suspension or role change which was pending while the row locked.
        actor = await self.session.scalar(select(User).join(Role, User.role_id == Role.id
            ).join(ServiceCenter, User.service_center_id == ServiceCenter.id).where(
                User.id == actor_id, User.service_center_id == self.sc,
                User.is_active.is_(True), Role.is_active.is_(True), ServiceCenter.is_active.is_(True),
            ).options(contains_eager(User.role)).with_for_update(read=True, of=(User, Role, ServiceCenter)
            ).execution_options(populate_existing=True))
        if actor is None or permission not in staff_permissions(actor):
            raise UnauthorizedAction()

    async def guard_write_session(self, actor_id: uuid.UUID, token: str) -> None:
        # Aggregate work may have waited after initial HTTP auth. Pin identity
        # first, then its family, matching staff disable/refresh lock ordering.
        await self._actor(actor_id, "staff.write")
        sessions = AuthSessionService(self.session)
        proof = sessions.proof(token, "staff")
        if proof["type"] != "access":
            raise InvalidToken()
        if proof.get("demo"):
            raise UnauthorizedAction()
        row = await sessions.load(proof, "staff", read_lock=True)
        if row.user_id != actor_id or row.service_center_id != self.sc:
            raise InvalidToken()

    async def issue(self, conv: Conversation, actor_id: uuid.UUID) -> str:
        await self._actor(actor_id, "staff.read")
        await prune_expired_observations(self.session, self.sc)
        now = await self.session.scalar(select(func.clock_timestamp()))
        observation = ConversationReadObservation(service_center_id=self.sc, conversation_id=conv.id,
            actor_id=actor_id, message_generation=conv.message_generation,
            activity_generation=conv.activity_generation, expires_at=now + OBSERVATION_TTL)
        self.session.add(observation)
        await self.session.flush()
        return str(observation.id)

    async def validate(self, conv: Conversation, observation_id: uuid.UUID | None,
            actor_id: uuid.UUID | None) -> ConversationReadObservation:
        if observation_id is None or actor_id is None:
            raise ConversationObservationInvalid()
        await self._actor(actor_id, "staff.write")
        observation = await self.session.scalar(select(ConversationReadObservation).where(
            ConversationReadObservation.id == observation_id,
            ConversationReadObservation.service_center_id == self.sc,
            ConversationReadObservation.conversation_id == conv.id,
            ConversationReadObservation.actor_id == actor_id,
            ConversationReadObservation.is_active.is_(True),
            ConversationReadObservation.expires_at > func.clock_timestamp(),
        ).with_for_update(read=True).execution_options(populate_existing=True))
        # The receipt lock itself can wait beyond its expiry. Validate the real
        # database clock again after acquiring it, before any aggregate effect.
        now = await self.session.scalar(select(func.clock_timestamp()))
        if (observation is None or observation.expires_at <= now or observation.message_generation > conv.message_generation
                or observation.activity_generation > conv.activity_generation):
            raise ConversationObservationInvalid()
        return observation

    @staticmethod
    def acknowledge(conv: Conversation, observation: ConversationReadObservation) -> None:
        conv.acknowledged_message_generation = max(conv.acknowledged_message_generation, observation.message_generation)
        conv.acknowledged_activity_generation = max(conv.acknowledged_activity_generation, observation.activity_generation)
        conv.unread_messages = conv.message_generation - conv.acknowledged_message_generation
        conv.unread_activity = conv.activity_generation - conv.acknowledged_activity_generation
