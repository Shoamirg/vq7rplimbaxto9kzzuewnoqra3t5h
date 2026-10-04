# Delivery workflow

## Resume

1. Identify the GarageOS checkout: verify the Git origin is `Shoamirg/garageos`
   and the FastAPI backend, Flutter app and dashboard are present. Read that
   checkout's `AGENTS.md`; a similarly named working directory may belong to a
   different repository.
2. Read the current body of [delivery issue #10](https://github.com/Shoamirg/garageos/issues/10),
   then the relevant linked issue and its evidence comments. Issue #10 owns the
   current scope, completed increments, remaining gates and next action. Keep
   dated implementation evidence in comments; refresh the issue body as the
   current state changes.
3. Inspect worktree status, branch, HEAD and exact-commit CI. Preserve existing
   work and distinguish the commit being edited from previously verified code.
4. Select one verifiable increment whose prerequisites are available. Confirm
   unknown external inputs when needed; retain earlier user decisions and
   authorization. Record the selected increment and completion criteria in the
   tracker before implementation.

## Execute and checkpoint

- Use `to-spec` to capture agreed scope and acceptance. Use `to-tickets` when an
  approved plan needs smaller issues and explicit blocking dependencies. Work
  implementation issues through `implement`/`tdd`; close implementation with the
  independent Standards and Spec reviews and appropriate verification.
- Reuse the agreed public API/real-database and Flutter workflow test seams.
  Record external release, device and deployment checks separately. For a
  documentation-only change, review the instructions and run `git diff --check`;
  add behavioral tests when behavior changes.
- Publish authorized work on `codex/service-work-demo` and update
  [PR #5](https://github.com/Shoamirg/garageos/pull/5). Merging or tagging is a
  separate user-authorized step. Keep client credentials outside Git and issue
  bodies.
- At an increment boundary, update its issue and #10 with exact commit, checks
  run, results, evidence links, remaining limits and the next action. Stop test
  services started for that increment. Use `ready-for-agent` for specified work
  still awaiting implementation; remove it from implemented increments awaiting
  PR merge. Use `needs-info` when the next action needs missing external input.

## Readiness evidence

Describe each state explicitly: implemented, locally verified, CI verified,
deployed, signed/device verified, or client accepted. An open issue awaiting PR
merge can already have implemented code. An unsigned iOS build, simulator test,
debug Android APK or offline demo proves only its stated scope. Claim client
delivery complete when the current issue #10 acceptance gates have evidence.

Use `CONTEXT.md` for domain vocabulary and ADRs for durable architecture decisions.
Current progress belongs in the tracker, so this workflow stays valid after the
next commit.
