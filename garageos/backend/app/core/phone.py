"""Phone number matching. Garages type numbers with and without +998."""
from __future__ import annotations

import re

from sqlalchemy import func


def normalize_phone(value: str | None) -> str:
    """Digits only; a bare 9-digit Uzbek national number gets the 998 prefix."""
    digits = re.sub(r"\D", "", value or "")
    return "998" + digits if len(digits) == 9 else digits


def phone_variants(digits: str) -> set[str]:
    variants = {digits}
    if digits.startswith("998") and len(digits) == 12:
        variants.add(digits[3:])
    return variants


def phone_matches(column, value: str):
    """SQL predicate: the stored phone (any formatting) is this number."""
    return func.regexp_replace(column, r"\D", "", "g").in_(phone_variants(normalize_phone(value)))
