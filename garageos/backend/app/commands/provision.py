"""Create a garage and staff on a migrated database without demo transactions."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import sys

from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import func, select, text

from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import Role, ServiceCenter, User
from app.schemas.provision import ProvisionManifest
from app.seeds.brands import seed_brands
from app.seeds.models import seed_vehicle_models
from app.seeds.roles import seed_roles

_PROVISION_LOCK = int.from_bytes(b"GarageOS", byteorder="big")


class ProvisioningError(Exception):
    """A safe, operator-readable provisioning failure."""


def _new_password_hash(entry: dict) -> str:
    value = os.environ.get(entry["password_env"])
    if value is None or not value.strip() or len(value) < 12 or len(value.encode("utf-8")) > 72:
        raise ProvisioningError(
            f"Set {entry['password_env']} to a password of at least 12 characters and at most 72 UTF-8 bytes."
        )
    return hash_password(value)


async def provision(config: dict, *, apply: bool) -> dict:
    async with async_session_factory.begin() as session:
        if apply:
            # Serialize this command across garages: role/model catalogs are global.
            await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _PROVISION_LOCK})
        migration_config = Config()
        migration_config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
        required_heads = set(ScriptDirectory.from_config(migration_config).get_heads())
        database_heads = set((await session.scalars(text("SELECT version_num FROM alembic_version"))).all())
        if database_heads != required_heads:
            raise ProvisioningError("Run alembic upgrade head before provisioning this database.")
        center_spec = {"timezone": "Asia/Tashkent", **config["service_center"]}
        zone = center_spec["timezone"]
        known_zone = await session.scalar(text("SELECT 1 FROM pg_timezone_names WHERE name = :zone"), {"zone": zone})
        if not known_zone:
            raise ProvisioningError("Unknown garage timezone; use a PostgreSQL timezone name such as Asia/Tashkent.")
        centers = (await session.execute(select(
            ServiceCenter.id, ServiceCenter.email, ServiceCenter.name, ServiceCenter.timezone,
            ServiceCenter.phone, ServiceCenter.address, ServiceCenter.is_active,
        ).where(func.lower(ServiceCenter.email) == center_spec["email"]))).all()
        if len(centers) > 1:
            raise ProvisioningError("Ambiguous garage email; resolve existing identities before provisioning.")
        center = centers[0] if centers else None
        center_created = center is None
        if center:
            if not center.is_active:
                raise ProvisioningError("Garage is suspended; provisioning cannot reactivate it.")
            if any(getattr(center, key) != value for key, value in config["service_center"].items() if key != "email"):
                raise ProvisioningError("Garage attributes conflict with existing data; no overwrite is allowed.")
        roles_active = (await session.execute(select(Role.name, Role.is_active).where(Role.name.in_([entry["role"] for entry in config["staff"]])))).all()
        if any(not role.is_active for role in roles_active):
            raise ProvisioningError("A requested global role is suspended; provisioning cannot reactivate it.")
        staff = []
        for entry in config["staff"]:
            users = (await session.scalars(select(User).where(func.lower(User.email) == entry["email"]))).unique().all()
            if len(users) > 1:
                raise ProvisioningError("Ambiguous staff email; resolve existing identities before provisioning.")
            user = users[0] if users else None
            if user:
                if not center or user.service_center_id != center.id:
                    raise ProvisioningError("Staff email belongs to another garage; transfer is not allowed.")
                if not user.is_active or not user.role.is_active:
                    raise ProvisioningError("Staff identity is suspended; provisioning cannot reactivate it.")
                if user.full_name != entry["full_name"] or user.role.name != entry["role"]:
                    raise ProvisioningError("Staff attributes conflict with existing data; no overwrite is allowed.")
            staff.append((entry, user))
        if not apply:
            return {
                "applied": False,
                "service_center": {"id": str(center.id) if center else None,
                                   "name": center.name if center else center_spec["name"],
                                   "email": center.email if center else center_spec["email"],
                                   "timezone": center.timezone if center else zone,
                                   "state": "create" if center_created else "keep"},
                "staff": [{"id": str(user.id) if user else None, "email": entry["email"], "role": entry["role"],
                           "full_name": entry["full_name"],
                           "state": "keep" if user else "create"} for entry, user in staff],
            }
        password_hashes = {entry["email"]: _new_password_hash(entry) for entry, user in staff if user is None}
        roles = await seed_roles(session)
        brands = await seed_brands(session)
        await seed_vehicle_models(session, brands)
        if center_created:
            center = ServiceCenter(**center_spec)
            session.add(center)
            await session.flush()
        staff_results = []
        for entry, user in staff:
            created = user is None
            if created:
                user = User(
                    service_center_id=center.id, role_id=roles[entry["role"]].id,
                    full_name=entry["full_name"], email=entry["email"],
                    password_hash=password_hashes[entry["email"]],
                    is_super_admin=False,
                )
                session.add(user)
                await session.flush()
            staff_results.append({"id": str(user.id), "email": user.email, "full_name": user.full_name,
                                  "role": entry["role"], "state": "created" if created else "kept"})
        result = {"applied": True, "service_center": {"id": str(center.id), "email": center.email, "name": center.name, "timezone": center.timezone,
                  "state": "created" if center_created else "kept"}, "staff": staff_results}
    return result


async def _run(path: Path, *, apply: bool) -> dict:
    try:
        # The operator command must not print SQL parameters or credential hashes.
        engine.echo = False
        engine.sync_engine.hide_parameters = True
        try:
            manifest = ProvisionManifest.model_validate_json(path.read_text(encoding="utf-8-sig"))
        except (ValidationError, OSError, UnicodeError):
            raise ProvisioningError("Invalid or unreadable config. Check the documented schema, unique emails and required admin.") from None
        return await provision(manifest.model_dump(mode="json", exclude_unset=True), apply=apply)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = asyncio.run(_run(args.config, apply=args.apply))
    except ProvisioningError as error:
        print(f"Provisioning failed: {error}", file=sys.stderr)
        raise SystemExit(2) from None
    except Exception:
        print("Provisioning failed: Database/setup operation failed. Check migrations/connectivity and inspect the plan before retrying; commit status may be unknown.", file=sys.stderr)
        raise SystemExit(2) from None
    print(json.dumps(result))


if __name__ == "__main__":
    main()
