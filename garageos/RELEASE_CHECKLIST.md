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
      Run every spec in `playwright.config.ts`, with the isolated production
      browser prerequisites in [local Jenkins](../docs/agents/local-jenkins.md).
      A selected account/platform subset is not the complete release gate.
      Synthetic signed Mini App launch data stays private; disable auth traces.
- [ ] **No accessibility regressions** — keyboard-navigable, visible focus rings,
      labelled icon-only controls, ≥44px touch targets, contrast AA, reduced
      motion respected (spot-check `/mini` + one staff screen)
      Run the unsuppressed scans and actual keyboard/target/motion checks in
      `e2e/accessibility.spec.ts`; review the inconclusive attachments and
      localized screenshots as described in [accessibility-release.md](docs/accessibility-release.md).
      Automation does not replace client-device/assistive-technology acceptance.
- [ ] **Localization complete** — `cd admin-dashboard && npm run i18n:check`
      (fails on any key missing across EN/RU/UZ); no hard-coded user-facing
      English in changed surfaces; dates/currency/plurals formatted per locale
      Also run `npm run i18n:audit` and `npm run i18n:audit -- --all`: a passing
      ratchet still permits its reported backlog and does not prove complete
      localization. See [feedback-localization.md](docs/feedback-localization.md)
      for the completed feedback slice, test seams and remaining scope.
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

Current GarageOS client delivery uses `codex/service-work-demo` and PR #5;
merging, tagging and deployment require their own authorization. The generic
tagged-release process below does not authorize those actions. Current evidence
and remaining gates live in [issue #10](https://github.com/Shoamirg/garageos/issues/10).

1. Branch `feature/<name>`; build in verifiable increments.
2. Run the gates above locally; fix reds.
3. Update `CHANGELOG.md` + `docs/demo-flow.md` if the flow changed.
4. Merge to `main` with `--no-ff`; tag `vX.Y.Z-name` (annotated).
5. Delete the feature branch. Leave `main` with a clean tree.

## Environment reminders

These reminders and demo reseeding apply only to an isolated development/demo
database. Never use `--fresh`, schema downgrade or volume deletion to repair a
client deployment. Client update/rollback follows [HANDOFF.md](docs/HANDOFF.md).

- Backend on **:8010** (no `--reload` — it spawns un-killable zombies); restart
  fully to pick up new routes.
- Next dev on **:3000** (falls back to :3001 if held); restart to pick up new
  routes/components — hot-reload is unreliable here.
- Postgres on **:5433** (host :5432 is taken); use `127.0.0.1`, not `localhost`.
- `PYTHONIOENCODING=utf-8` for any smoke script that prints non-ASCII.
- After live tests that mutate data, re-seed `--fresh` for a clean demo.

## Client handoff

Use [HANDOFF.md](docs/HANDOFF.md) to record actual hosting/accounts,
scheduled off-host backups and restore/rollback, owner signing and physical
Android/iPhone checks, agreed performance, daily pilot and support owner.
Give users [USER-GUIDE.md](docs/USER-GUIDE.md) and confirm they can follow it.
Blank receipt fields and synthetic QA results leave those client gates pending.
