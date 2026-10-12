"""Locking repository queries must refresh ORM identity-map state after waits."""
from types import SimpleNamespace
import uuid
from unittest.mock import AsyncMock

import pytest

from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.work_order_repository import WorkOrderRepository


@pytest.mark.asyncio
async def test_work_order_lock_query_refreshes_loaded_row():
    session = SimpleNamespace(execute=AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
    ))
    repository = WorkOrderRepository(session, uuid.uuid4())

    await repository.get_for_update(uuid.uuid4())

    statement = session.execute.await_args.args[0]
    assert statement._for_update_arg is not None
    assert statement._execution_options.get("populate_existing") is True


@pytest.mark.asyncio
async def test_appointment_lock_query_refreshes_loaded_row():
    session = SimpleNamespace(execute=AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
    ))
    repository = AppointmentRepository(session, uuid.uuid4())

    await repository.get_with_slot_for_update(uuid.uuid4())

    statement = session.execute.await_args.args[0]
    assert statement._for_update_arg is not None
    assert statement._execution_options.get("populate_existing") is True
