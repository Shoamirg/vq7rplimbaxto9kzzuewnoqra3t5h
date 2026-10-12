"""Unit of Work must release its database session on rollback paths."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.unit_of_work import UnitOfWork


@pytest.mark.asyncio
async def test_exception_rolls_back_and_closes_session():
    session = SimpleNamespace(
        rollback=AsyncMock(),
        close=AsyncMock(),
    )
    uow = UnitOfWork()
    uow.session = session

    await uow.__aexit__(RuntimeError, RuntimeError("fail"), None)

    session.rollback.assert_awaited_once()
    session.close.assert_awaited_once()
    assert uow._events == []


@pytest.mark.asyncio
async def test_commit_failure_rolls_back_and_closes_session():
    session = SimpleNamespace(
        commit=AsyncMock(side_effect=RuntimeError("commit failed")),
        rollback=AsyncMock(),
        close=AsyncMock(),
    )
    uow = UnitOfWork()
    uow.session = session

    with pytest.raises(RuntimeError, match="commit failed"):
        await uow.__aexit__(None, None, None)

    session.rollback.assert_awaited_once()
    session.close.assert_awaited_once()
