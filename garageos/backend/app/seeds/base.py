"""Shared helpers for the seed framework.

Deterministic by design: a fixed RNG seed means re-running produces the same
demo data, which keeps screenshots, tests, and demos stable.
"""
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# backend/app/seeds/base.py -> backend/data
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# Single deterministic RNG shared across generators for reproducible datasets.
rng = random.Random(1337)


def load_json(filename: str) -> Any:
    """Load a JSON data file from backend/data/."""
    path = DATA_DIR / filename
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


async def get_or_create(
    session: AsyncSession,
    model: type,
    defaults: dict | None = None,
    **lookup: Any,
):
    """Return an existing row matching ``lookup`` or create one.

    Makes reference-data seeding idempotent. Returns ``(instance, created)``.
    """
    stmt = select(model).filter_by(**lookup)
    result = await session.execute(stmt)
    instance = result.scalar_one_or_none()
    if instance is not None:
        return instance, False
    params = {**lookup, **(defaults or {})}
    instance = model(**params)
    session.add(instance)
    await session.flush()
    return instance, True


# --- Lightweight, dependency-free fake-data generators -----------------------

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Nancy", "Matthew", "Lisa",
    "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley", "Steven", "Kimberly",
    "Andrew", "Emily", "Joshua", "Donna", "Kevin", "Michelle", "Brian", "Carol",
    "Omar", "Aisha", "Yusuf", "Fatima", "Ali", "Layla", "Hassan", "Noor", "Karim", "Mona",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Clark", "Lewis", "Walker", "Hall", "Allen", "Khan", "Ahmed",
    "Hussain", "Rahman", "Ali", "Sharma", "Patel", "Singh", "Nguyen", "Kim",
]

_PLATE_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"
_VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"  # excludes I, O, Q per VIN standard
COLORS = ["Black", "White", "Silver", "Gray", "Blue", "Red", "Green", "Beige"]
TRANSMISSIONS = ["Automatic", "Manual"]


def full_name() -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def phone() -> str:
    return f"+1{rng.randint(200, 989)}{rng.randint(100, 999)}{rng.randint(1000, 9999)}"


def license_plate() -> str:
    letters = "".join(rng.choice(_PLATE_LETTERS) for _ in range(3))
    return f"{letters}{rng.randint(1000, 9999)}"


def vin() -> str:
    return "".join(rng.choice(_VIN_CHARS) for _ in range(17))


def email_for(name: str, suffix: str = "example.com") -> str:
    base = name.lower().replace(" ", ".")
    return f"{base}{rng.randint(1, 999)}@{suffix}"
