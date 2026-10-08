# Operations workflow

The staff console reads the [case list API](case-list-api.md) with 20-row
pages, literal trimmed server search, status/type filters and filtered counts.
Changing filters/pages clears ordinary selection and the previous result until
the current request succeeds. Same-filter refresh failures retain explicitly
marked last-successful data; authentication/permission denial clears the workspace.

An Inbox `?case=<UUID>` link opens that case independently of the current page.
An outside-page case is labelled as such. A missing/foreign case is unavailable;
it never silently selects another case. Deliberate browsing replaces link intent.

The full real mechanic roster is available in the labelled selector. Equal
persisted names include the shortest distinguishing stable UUID prefix; prefix
collisions extend the suffix. The selected UUID, not a display name, is assigned.
Writes require server-validated `staff.write`; backend authorization remains final.

A status/assignment PATCH acknowledges a partial summary. A new full GET supplies
the customer, vehicle, mechanic and recorded events. The console blocks another
write on that case until a fresh post-write snapshot succeeds. A failed enrichment
read does not turn an acknowledged save into a failed write. Unknown save outcomes
require a fresh state check before a deliberate new action; PATCH is never replayed
automatically. Async responses carry filter/selection identities so an old response
cannot paint a newly selected case. Browsing another case remains available while
a write is pending; its full reads and post-write readiness belong to that case.

The conversation is the persisted Inbox aggregate for that validated case. Reply
and internal-note drafts remain separate per case in component memory, including
phone pane and locale changes. Sending captures the thread, body and mode and
blocks duplicate pending submissions. Only an acknowledged submitted draft is
cleared, preserving later edits. A transport/5xx outcome is uncertain; refresh the
thread and check recorded messages before deliberately sending again. This client
guard does not provide durable exactly-once message delivery. A reply after an
internal note uses the last non-internal recorded channel, falling back to web.
Read-only sessions can view an existing thread. If no thread exists, the API
returns `CASE_CONVERSATION_UNAVAILABLE` without creating one. This local thread
state keeps the authorized case details visible; ordinary authentication and
permission denials still clear the protected workspace.

Case first-open creators hold a lock on the tenant/reference-validated case row
through the normal UnitOfWork commit. Parallel case entry reuses the same thread
instead of creating separate message histories. Existing multiple legacy threads
are read deterministically by oldest creation time and UUID; this does not merge
their historical messages. Generic Inbox creation/entry and message idempotency
remain separate boundaries.

UZ/EN/RU labels, formatted durations/counts and accessible navigation use the
existing locale context. Below the desktop three-pane layout, labelled list,
detail and conversation navigation keeps drafts in memory. Recorded status,
location and events are shown without fabricated tracking, inferred past status
steps, customer-contact confirmations, ETA or inactive integration controls.
Saved names, titles and message text remain escaped persisted data.

The actual HTTP/PostgreSQL concurrency regressions are
`backend/tests/test_case_conversation_concurrency_api.py`; browser workflows are
`admin-dashboard/e2e/operations-workflow.spec.ts` and
`admin-dashboard/e2e/operations-boundaries.spec.ts`, with failure/locale/access
coverage in `admin-dashboard/e2e/operations-resilience.spec.ts`. The complete scope and current
verification state are in [issue37](https://github.com/Shoamirg/garageos/issues/37),
including broader interaction/phone/dark/duplicate-identity scenarios and final
release gates. Client deployment, signing/devices and acceptance remain in
[issue10](https://github.com/Shoamirg/garageos/issues/10).
