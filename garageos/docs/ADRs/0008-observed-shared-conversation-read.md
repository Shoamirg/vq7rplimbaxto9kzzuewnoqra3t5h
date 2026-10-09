# Observed shared conversation read boundary

## Status

Proposed for #39. The generation/observation implementation and both staff GET
consumers are implemented locally. Owning PostgreSQL/HTTP concurrency, migration
and real backup/fresh restore checks have run; exact results are recorded in
[issue39](https://github.com/Shoamirg/garageos/issues/39). Production browser and
release verification remain delivery requirements. This scoped decision does
not establish completion of the full Inbox plan or client acceptance.

## Context

Unread message and activity counts belong to the shared Conversation aggregate.
They are not individual staff read receipts or customer delivery acknowledgements.
Zeroing the current counters after a thread GET also clears messages or activity
committed after that GET. A conversation lock alone cannot distinguish what the
reader observed before acquiring the later acknowledgement lock.

A stateless signed generation token has a recovery problem: after restoring an
older database, generations can catch up to a token issued on the discarded
timeline. That token could then acknowledge different, unseen arrivals. Process
nonces avoid some restarts but fail across independent application workers.

## Proposed decision

Persist independent monotonically increasing message and activity generations
and their shared acknowledged generations on Conversation. Serialize increments,
status/assignment changes and acknowledgements with the existing conversation
row lock through normal UnitOfWork commit. Refresh loaded ORM state under that
lock. Derive each unread count from generated minus acknowledged; duplicate
status/assignment set operations create no activity. A combined status/assignment
change is one activity, after validating every supplied field before any effect.
Incoming customer messages retain their existing non-internal unread semantics;
matching durable message-intent replay changes no generation.
Database checks enforce nonnegative generations and acknowledged <= generated,
with each recorded unread count equal to its corresponding difference.

After acquiring an aggregate lock, recheck its safe references and children in
a fresh statement snapshot. A child can commit while the first lock statement
waits; PostgreSQL's [Read Committed behavior](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED)
does not make all predicates in that earlier statement a fresh database snapshot.
Also recheck the real database clock after an observation lock wait, so an
observation which expired while waiting cannot authorize acknowledgement.

The authorized staff thread GET captures a coherent locked aggregate/history
and persists an opaque random UUID observation containing tenant, conversation,
authenticated staff UUID, both observed generations and a 24-hour expiry.
Commit its normal UnitOfWork before sending success. The returned UUID is not an
authentication token; possession alone grants no access. Internal/customer thread
reads do not issue staff observations implicitly.

Both staff entry points, `GET /conversations/{id}` and
`GET /cases/{id}/conversation`, explicitly supply the authenticated staff UUID
and finalize their observation transaction before sending success. Operations
first-thread creation retains its existing authorization and normal transaction.
Calls from the customer Mini or internal services to the same conversation
service do not obtain staff observations. Eligible read-only and demo principals
can read recorded history, but their normal current write policy denies an
acknowledgement; an observation never expands their permissions.

Mark-read requires that server-issued observation. Recheck normal current
authentication, staff-write/demo policy and safe aggregate/reference ownership
before lookup or effects. Under the conversation lock, accept only a retained,
unexpired observation for that same tenant, conversation and authenticated staff.
Reject absent, malformed, foreign, expired or future observations without
revealing their contents or changing counters. Advance each shared acknowledged
generation with max(current acknowledgement, observed generation); newer arrivals
remain unread. An older or repeated acknowledgement is an idempotent set action.
Assignment, subscription and historical participants remain separate concepts.

Observation rows have a tenant/expiry/UUID index. Each issuance removes at most
100 already expired local rows using SKIP LOCKED; no other tenant's rows are
selected. Sample the database clock once per cleanup batch and bind that cutoff
to the expiry predicate, so the index can bound work even when a tenant retains
many live observations and has no expired rows. PostgreSQL's
[function volatility rules](https://www.postgresql.org/docs/18/xfunc-volatility.html)
exclude a volatile per-row clock from an index scan condition. Keep the separate
real-clock expiry validation after the acknowledgement's receipt lock wait.
Materialize the selected and locked batch once before DELETE consumes its IDs.
This preserves the deletion bound when a locking subquery could otherwise be
re-evaluated during deletion. The explicit
[materialized CTE](https://www.postgresql.org/docs/18/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION)
retains the selected batch instead of permitting repeated selection.
A controlled maintenance command additionally prunes expired rows in
bounded batches for idle tenants, with explicit maximum batches per invocation.
Expired observations cannot acknowledge anything, even before physical cleanup.
Do not expose observation rows in thread/history exports or logs. Retention is
only for the bounded observation lifetime; this differs from ADR0007's permanent
message-intent replay ledger. No per-user unread state, delivery receipts,
background resend, external provider or event outbox is introduced.

## Migration and recovery

Initialize generated counts from the existing recorded unread counters and
acknowledged generations to zero, without inventing historical message events.
Existing messages, participant roles, status and other thread fields stay intact.
Seeders and all legitimate aggregate producers must update generation/counter
state consistently. The new observation table starts empty; no client-supplied
legacy counter or guessed observation is backfilled as authority.

A complete backup includes the conversation generation fields and observation
table. An observation issued after the backed-up transaction snapshot is absent
after restore and is rejected. Observations present in that snapshot can only
acknowledge generations already present in that snapshot, so newly committed
post-restore arrivals remain unread. This requires receipts and aggregate state
to share the same transactional PostgreSQL backup, rather than separate table
exports or retained stateless tokens. Test this with a real fresh restore and
subsequent new arrivals, including generation catch-up.

Downgrade removes observation authority and generation fields while preserving
the current legacy counters and business history. Re-upgrade creates a fresh
empty observation table; discarded observation UUIDs fail rather than matching
new state. Stop producers and take a complete receipt-bearing backup before
schema rollback. Existing message-intent rollback limitations in ADR0007 remain.

## Alternatives and consequences

Client counters, timestamps and a row lock around unconditional zeroing cannot
prove an observed boundary. Signed generation tokens without retained observations
cannot distinguish a discarded database timeline after recovery. A single
generation cannot independently acknowledge message and activity counts.
Per-user read state would change the existing shared meaning and is outside #39.

The observation table adds one short-lived row per eligible staff thread read,
a small write on GET, bounded cleanup and a brief aggregate lock. Verify first
response durability, concurrent reads/writes, meaningful large-history query
work and multi-worker compatibility. A denied or unavailable read yields no
observation capability and cannot imply that the thread was acknowledged.
ADR0004's post-commit notification dispatch crash gap remains unchanged.

## Required verification

Use normal authentication, real PostgreSQL, foreign keys and UnitOfWork for both
staff GET entry points, including coherent history under overlapping incoming
messages and observation durability at the first successful ASGI send. Exercise
Mini incoming messages through their owning authenticated endpoint, internal
thread reads without staff observations and read-only/demo acknowledgement
denial. Existing Operations and durable message-intent consumers remain covered.

Prove expired-observation cleanup is bounded and tenant isolated, including
locked expired rows and idle-tenant maintenance invocation bounds. On a populated
migrated database, verify generation initialization, preserved business history,
fresh upgrade, downgrade and re-upgrade with discarded observations rejected.
Perform an actual PostgreSQL backup and fresh restore: a discarded post-backup
UUID remains rejected even after generations catch up, while an observation
present in the backup cannot acknowledge newly committed post-restore arrivals.
These are required acceptance checks, not evidence supplied by this proposal.
