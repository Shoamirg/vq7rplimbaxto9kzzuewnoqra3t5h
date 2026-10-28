"""Enroll a new platform operator on an existing garage; default is read-only."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
from typing import TYPE_CHECKING

from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import func, select, text

if TYPE_CHECKING:
    from app.schemas.platform_enrollment import PlatformEnrollmentManifest

# Coordinate with ordinary operator provisioning, without extending its rights.
_PROVISION_LOCK = int.from_bytes(b"GarageOS", byteorder="big")


class EnrollmentError(Exception):
    """Operator-readable failure which never contains supplied secret values."""


async def enroll(manifest: PlatformEnrollmentManifest, *, apply: bool) -> dict:
    from app.core.database import async_session_factory
    from app.core.security import hash_password
    from app.core.staff_access import staff_permissions
    from app.models import Role, ServiceCenter, User

    async with async_session_factory.begin() as session:
        if apply:
            await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _PROVISION_LOCK})
        migration_config = Config()
        migration_config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
        required_heads = set(ScriptDirectory.from_config(migration_config).get_heads())
        database_heads = set((await session.scalars(text("SELECT version_num FROM alembic_version"))).all())
        if database_heads != required_heads:
            raise EnrollmentError("Run alembic upgrade head before platform enrollment.")

        centers = select(ServiceCenter).where(ServiceCenter.id == manifest.service_center_id)
        roles = select(Role).where(Role.name == "super_admin")
        users = select(User).where(func.lower(User.email) == manifest.email)
        if apply:
            centers = centers.with_for_update()
            roles = roles.with_for_update()
            users = users.with_for_update(of=User)
        center = await session.scalar(centers)
        if center is None or not center.is_active:
            raise EnrollmentError("Choose an existing active anchoring garage; this command cannot create or reactivate it.")
        role = await session.scalar(roles)
        if role is None or not role.is_active:
            raise EnrollmentError("The existing super_admin catalog role must be active; this command cannot create or reactivate it.")
        matches = (await session.scalars(users)).unique().all()
        if len(matches) > 1:
            raise EnrollmentError("Ambiguous staff email; resolve existing identities separately.")
        user = matches[0] if matches else None
        if user is not None and (
            not user.is_active or user.service_center_id != center.id or user.role_id != role.id
            or not user.is_super_admin or user.full_name != manifest.full_name or user.email != manifest.email
        ):
            raise EnrollmentError("Existing identity conflicts with enrollment; no promotion, overwrite or reactivation is allowed.")

        created = user is None
        if apply and created:
            password = os.environ.get(manifest.password_env)
            if password is None or not password.strip() or len(password) < 12 or len(password.encode("utf-8")) > 72:
                raise EnrollmentError("Set the named private password variable to at least 12 characters and at most 72 UTF-8 bytes.")
            user = User(service_center_id=center.id, role=role, full_name=manifest.full_name,
                        email=manifest.email, password_hash=hash_password(password), is_super_admin=True)
            session.add(user)
            await session.flush()

        # Even a plan discloses the existing anchoring-garage capabilities. It
        # does not present the globally GET-only panel as a read-only identity.
        identity = user if user is not None else User(role=role, is_active=True)
        result = {
            "applied": apply,
            "account": {
                "id": str(user.id) if user is not None else None,
                "service_center_id": str(center.id), "email": manifest.email,
                "full_name": manifest.full_name, "role": "super_admin", "is_super_admin": True,
                "state": ("created" if created else "kept") if apply else ("create" if created else "keep"),
            },
            "access": {"platform": ["platform.read", "platform.write"], "anchoring_garage": staff_permissions(identity)},
        }
    return result


async def _run(path: Path, *, apply: bool) -> dict:
    engine = None
    try:
        # Settings/engine initialization may fail too; keep it inside the safe
        # error boundary rather than leaking an import traceback/config value.
        from app.core.database import engine
        from app.schemas.platform_enrollment import PlatformEnrollmentManifest

        engine.echo = False
        engine.sync_engine.hide_parameters = True
        try:
            manifest = PlatformEnrollmentManifest.model_validate_json(path.read_text(encoding="utf-8-sig"))
        except (ValidationError, OSError, UnicodeError):
            raise EnrollmentError("Invalid or unreadable config; use the documented non-secret platform manifest.") from None
        return await enroll(manifest, apply=apply)
    finally:
        if engine is not None:
            await engine.dispose()


class _SafeParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.print_usage(sys.stderr)
        self.exit(2, "Platform enrollment failed: Invalid command arguments. Use --config and optional --apply; see --help.\n")


def main() -> None:
    parser = _SafeParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = asyncio.run(_run(args.config, apply=args.apply))
    except EnrollmentError as error:
        print(f"Platform enrollment failed: {error}", file=sys.stderr)
        raise SystemExit(2) from None
    except Exception:
        print("Platform enrollment failed: Database/setup operation failed. Check connectivity/migrations and rerun the read-only plan; commit status may be unknown.", file=sys.stderr)
        raise SystemExit(2) from None
    print(json.dumps(result))


if __name__ == "__main__":
    main()
