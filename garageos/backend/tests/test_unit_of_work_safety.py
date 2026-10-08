from unittest.mock import AsyncMock
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AppointmentConflict
from app.repositories.unit_of_work import UnitOfWork


async def test_rejected_action_releases_session_and_clears_events():
    uow = UnitOfWork()
    uow.session = AsyncMock(spec=AsyncSession)
    uow._events.append(object())
    await uow.__aexit__(AppointmentConflict, AppointmentConflict(), None)
    uow.session.rollback.assert_awaited_once()
    uow.session.close.assert_awaited_once()
    assert not uow._events


async def test_failed_commit_still_releases_session():
    uow = UnitOfWork()
    uow.session = AsyncMock(spec=AsyncSession)
    uow.session.in_transaction.return_value = True
    uow.session.commit.side_effect = RuntimeError("test commit failure")
    with pytest.raises(RuntimeError):
        await uow.__aexit__(None, None, None)
    uow.session.commit.assert_awaited_once()
    uow.session.rollback.assert_awaited_once()
    uow.session.close.assert_awaited_once()
