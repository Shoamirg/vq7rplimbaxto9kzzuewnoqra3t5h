# API transaction boundaries

Existing transactional writes finish PostgreSQL commit before the first HTTP
success response is sent. A failed commit rolls back and returns an error,
so an immediate refresh cannot mistake a flushed change for a saved change.
Business values, permissions, tenant boundaries and financial calculations are
preserved. Staff thread GET responses now include `read_observation`; mark-read
requires that observed boundary in its PATCH input. Services still flush within
one transaction; financial operations
are not split into several commits.

## Dependency inventory and ownership

The reviewed inventory contains 52 POST/PUT/PATCH/DELETE endpoint functions.
44 declare a yielding UnitOfWork dependency; all now use explicit function scope.
The existing `GET /cases/{case_id}/conversation` can create a conversation,
participants and opening message, so it also uses function scope. Its existing
`allow_create="staff.write" in permissions` guard remains. Both staff thread
GETs (`GET /cases/{case_id}/conversation` and `GET /conversations/{id}`) also
persist an actor-bound read observation, using function scope to commit it
before the first success response. This does not grant read-only/demo staff
permission to create a thread or acknowledge it. Internal/customer thread
reads do not issue staff observations. See [ADR0008](ADRs/0008-observed-shared-conversation-read.md).

| Endpoint module | Transaction dependency | Actual route functions |
| --- | --- | --- |
| `appointments.py` | `get_tenant_uow` | `book_appointment`, `create_appointment_direct`, `confirm_appointment`, `start_appointment`, `cancel_appointment`, `complete_appointment`, `update_appointment`, `move_appointment`, `assign_mechanic` |
| `cases.py` | `get_tenant_uow` | `case_conversation`, `create_case`, `update_case` |
| `conversations.py` | `get_tenant_uow` | `get_thread`, `create_conversation`, `post_message`, `update_conversation`, `follow`, `unfollow` |
| `customers.py` | `get_tenant_uow` / `owner_uow` | `create_customer`, `delete_customer`, `open_customer_account`, `customer_account_access` |
| `invoices.py` | `get_tenant_uow` | `create_document`, `delete_document`, `send_telegram`, `edit_document`, `record_payment`, `send_document`, `convert_document`, `update_document` |
| `mechanic_work.py` | `get_mechanic_uow` | `start_work`, `complete_work` |
| `notifications.py` | `get_tenant_uow` | `mark_read`, `mark_all_read` |
| `slots.py` | `get_tenant_uow` | `generate_slots` |
| `staff.py` | `owner_uow` | `create_staff`, `update_staff` |
| `vehicles.py` | `get_tenant_uow` | `create_vehicle`, `delete_vehicle` |
| `customer/appointments.py` | `get_customer_uow` | `book_appointment` |
| `customer/billing.py` | `get_customer_uow` | `approve_estimate`, `decline_estimate`, `ask_estimate` |
| `customer/messages.py` | `get_customer_uow` | `post_message` |
| `customer/roadside.py` | `get_customer_uow` | `request_roadside`, `add_attachment` |

The table inventories dependency declarations, including `send_telegram`, which
reads the invoice and sends externally rather than mutating PostgreSQL. Its
function scope does not make external message delivery database-atomic.

The other eight write-method endpoints are auth flows: staff login/refresh/demo
and customer Telegram/link/refresh/dev/password. Staff auth methods read and
create tokens; their best-effort audit owns and awaits its separate transaction.
Customer Telegram login can refresh the stored username; phone linking writes
the Telegram association. Their auth-service leaf therefore gives its yielding
`get_db` dependency function scope. The other structured customer auth results
share that leaf. Current-user/current-customer identity dependencies keep their
existing lifetime. Owner, mechanic and password-customer permission checks
remain in their existing dependencies.

Affected responses are materialized dictionaries or DTOs before dependency exit;
they do not stream from a live database session. Read-only routes, platform reads
and operator CLI transaction ownership keep their existing behavior. Inventory
counts classify declarations; they do not claim a separate runtime probe for
every endpoint.

## Booking replay and transaction finalization

For slot booking with `Idempotency-Key`, the cache key remains tenant namespaced.
The entire completed booking is committed inside the existing create/release
error boundary, before its appointment ID is published to Redis. Creation or
commit failure releases the pending key and propagates the exception to rollback.
The failed booking leaves its slot available and the same key can be retried.
Successful replay returns the same appointment; an in-progress request remains
rejected and Redis unavailability retains its existing degraded behavior.

UnitOfWork exit commits only an active SQLAlchemy session transaction. After
explicit whole-booking commit, it closes the session without a second empty
commit. A later query or write starts a new transaction on that session and is
still committed on normal exit or rolled back on exceptional exit. No permanent
"finalized" flag prevents later transactions. Existing events are dispatched
after successful commit and cleared once; notification handlers remain
asynchronous under [ADR 0004](ADRs/0004-event-driven-notifications.md). HTTP
success proves business-state durability, not completed notification delivery.

## Verification seam

`tests/test_transaction_response_api.py` uses existing authenticated HTTP
fixtures against migrated PostgreSQL, without overriding transaction or auth
dependencies. An ASGI send observer reads the aggregate from an independent
session at the **first** success header, before forwarding it. A completed
ASGITransport request alone waits for request cleanup and can miss this defect.

Representative probes cover tenant customer writes, owner staff/audit atomicity,
assigned mechanic work, customer case/thread creation, first case conversation
creation, invoice/payment/ledger state and raw customer-auth session writes.
Controlled precommit failure must send only an error, preserve old state and
dispatch no domain event. Payment rollback permits the same key to recover and
replay one payment/credit. Booking uses real PostgreSQL with an explicitly
isolated cache adapter to inspect durability at cache publication, failed-commit
key release, same-key retry/replay and independent keys across two real tenants.
UnitOfWork tests also exercise explicit commit followed by a second transaction.

Complete backend, live Flutter/API, production browser and local Jenkins release
gates remain delivery evidence recorded in [issue 34](https://github.com/Shoamirg/garageos/issues/34).
Client deployment, owner signing, physical devices and pilot acceptance remain
separate requirements in [issue 10](https://github.com/Shoamirg/garageos/issues/10).
