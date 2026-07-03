# Release Checklist

Every tagged version (`vX.Y.Z-name`) must satisfy this list before the tag is
cut. Keep it honest — a red box blocks the release, not the checklist.

## Gates

- [ ] **TypeScript clean** — `cd admin-dashboard && npx tsc --noEmit`
- [ ] **Backend tests pass** — `cd backend && ./.venv/Scripts/python.exe -m pytest -q`
- [ ] **Lint clean** — `cd admin-dashboard && npm run lint`
- [ ] **End-to-end regression passes** — `cd admin-dashboard && npm run e2e`
      (staff journey: login → dashboard → calendar → appointments → customer 360
      → operations → inbox → billing → reports; + customer journey: `/mini` home
      → vehicle passport → billing estimate → roadside → messages)
- [ ] **No accessibility regressions** — keyboard-navigable, visible focus rings,
      labelled icon-only controls, ≥44px touch targets, contrast AA, reduced
      motion respected (spot-check `/mini` + one staff screen)
- [ ] **Localization complete** — `cd admin-dashboard && npm run i18n:check`
      (fails on any key missing across EN/RU/UZ); no hard-coded user-facing
      English in changed surfaces; dates/currency/plurals formatted per locale
- [ ] **Performance budget met** — landing/app JS within budget, no new render
      waterfalls, polling intervals unchanged or justified (measure, don't guess)
- [ ] **Changelog updated** — new entry in `CHANGELOG.md`
- [ ] **Demo seed verified** — `cd backend && ./.venv/Scripts/python.exe -m app.seeds.demo --fresh`
      then walk `docs/demo-flow.md` (both tenants) with no errors
- [ ] **Migration tested** — `alembic upgrade head` on a fresh DB, then
      `alembic downgrade -1` and back up (up → down → up clean)
- [ ] **Rollback verified** — if the release changes data shape, confirm the
      previous tag still boots against the migrated DB (or document the break)

## Process

1. Branch `feature/<name>`; build in verifiable increments.
2. Run the gates above locally; fix reds.
3. Update `CHANGELOG.md` + `docs/demo-flow.md` if the flow changed.
4. Merge to `main` with `--no-ff`; tag `vX.Y.Z-name` (annotated).
5. Delete the feature branch. Leave `main` with a clean tree.

## Environment reminders

- Backend on **:8010** (no `--reload` — it spawns un-killable zombies); restart
  fully to pick up new routes.
- Next dev on **:3000** (falls back to :3001 if held); restart to pick up new
  routes/components — hot-reload is unreliable here.
- Postgres on **:5433** (host :5432 is taken); use `127.0.0.1`, not `localhost`.
- `PYTHONIOENCODING=utf-8` for any smoke script that prints non-ASCII.
- After live tests that mutate data, re-seed `--fresh` for a clean demo.
