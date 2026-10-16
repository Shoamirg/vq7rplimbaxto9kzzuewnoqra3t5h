"""Bounded operator cleanup for one explicitly selected tenant's expired reads.

Run: python -m app.maintenance.conversation_observations --service-center UUID
The configured database is authoritative. No observation UUID/body is logged.
"""
import argparse
import asyncio
import uuid

from app.core.database import engine
from app.repositories.unit_of_work import UnitOfWork
from app.services.conversation_read_service import PRUNE_BATCH_SIZE, prune_expired_observations


async def prune(service_center_id: uuid.UUID, max_batches: int) -> int:
    if not 1 <= max_batches <= 100:
        raise ValueError("max_batches must be between 1 and 100")
    total = 0
    for _ in range(max_batches):
        async with UnitOfWork(service_center_id=service_center_id) as uow:
            removed = await prune_expired_observations(uow.session, service_center_id)
        total += removed
        if removed < PRUNE_BATCH_SIZE:
            break
    return total


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service-center", type=uuid.UUID, required=True)
    parser.add_argument("--max-batches", type=int, choices=range(1, 101), default=1)
    args = parser.parse_args()
    try:
        total = await prune(args.service_center, args.max_batches)
        print(f"Removed {total} expired observations in at most {args.max_batches} batches")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
