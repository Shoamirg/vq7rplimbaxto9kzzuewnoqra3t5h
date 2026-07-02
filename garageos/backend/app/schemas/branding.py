"""White-label branding — one shape consumed by every surface (shell, login,
passport, PDF, emails, Mini App). Falls back to sensible defaults so a tenant
without explicit branding still renders cleanly."""
from __future__ import annotations

from pydantic import BaseModel

_DEFAULT_PRIMARY = "#2563EB"


class Branding(BaseModel):
    name: str
    tagline: str | None = None
    monogram: str
    primary_color: str
    accent_color: str
    slug: str | None = None


def _monogram(name: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    return "".join(w[0] for w in name.split()[:2] if w).upper() or "G"


def branding_dict(center) -> dict:
    """Serialize a ServiceCenter into the branding shape (with fallbacks)."""
    name = getattr(center, "brand_name", None) or center.name
    primary = getattr(center, "primary_color", None) or _DEFAULT_PRIMARY
    accent = getattr(center, "accent_color", None) or primary
    return {
        "name": name,
        "tagline": getattr(center, "tagline", None),
        "monogram": _monogram(name, getattr(center, "monogram", None)),
        "primary_color": primary,
        "accent_color": accent,
        "slug": getattr(center, "slug", None),
    }
