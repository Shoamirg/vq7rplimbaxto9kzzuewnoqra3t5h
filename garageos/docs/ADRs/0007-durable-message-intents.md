# Durable message submission receipts

## Status

Accepted for #38; implementation and release verification are tracked there.

## Context

Operations, Inbox and the Telegram customer Mini share one conversation
aggregate. A message can commit even when its HTTP response is lost. Local
pending guards and matching text/timestamps cannot distinguish a deliberate
second message from a retry. The existing booking Redis cache has a different
scope, expiry and failure policy.

## Decision

Both existing message POST endpoints accept an optional UUID `Idempotency-Key`.
Missing headers preserve explicitly unkeyed legacy/internal producers. Empty,
malformed and oversized values fail validation before effects. Both BFFs
forward header presence, including an empty supplied value.

Persist a tenant business ledger with unique `(service_center_id,
conversation_id, actor_kind, authenticated_actor_id, canonical_UUID_key)`.
Staff and customer namespaces distinguish equal UUIDs; accepted display-author
fields do not establish intent ownership. Authenticate and validate current
permissions/ownership, the active conversation, linked tenant references and
participant/message/attachment edges before first insertion or cached replay.
Local inactive historical references and transferred local vehicles retain
their owning-model snapshots; missing optional links are valid.

Lock the validated conversation row through the normal UnitOfWork commit and
refresh any previously loaded ORM state under the lock. Insert message,
attachments, thread fields and receipt atomically. The scoped unique constraint
is durable protection; do not suppress arbitrary integrity errors. A waiting
caller sees commit or rollback, never an uncommitted success. First insertion
queues one MessagePosted; matching replay queues none and changes no thread
fields. Different content returns409 `MESSAGE_INTENT_CONFLICT` without revealing
the stored response. Another actor/conversation/tenant has an independent scope.

Version1 fingerprints hash sorted-key UTF-8 JSON of exact body (including
meaningful whitespace), kind, effective internal mode/channel, accepted role,
explicit staff author-name input, ordered mentions and ordered complete
attachments (kind/label/url/meta). Object member order is immaterial; array order
and material values are not. Omitted/default fields normalize to their existing
effective defaults. Null/empty mentions and attachments normalize to empty
arrays; null/missing attachment URL/meta normalize to null, while an empty meta
object remains distinct. Dispatcher/manager null/absent/empty staff names use
the existing default; other accepted staff author roles retain the distinction
between null and empty names. Customer names are derived, and current profile
names and server timestamps are not request content. Internal
notes use effective channel `internal` regardless of the supplied channel.
Future fingerprint versions must preserve retained receipt compatibility or
explicitly reject it; never reinterpret an old key as a fresh write.

Link each receipt to its message and store its acknowledged representation,
including ordered attachment UUIDs and author/time snapshots. This preserves
the same response even if a delivery status or current display name changes.
Thread/list projections expose neither receipt keys nor fingerprints. Receipts
have no TTL or soft-delete release of their uniqueness and remain for the
message's lifetime; physical deletion of the message cascades its receipt.

Browser callers synchronously freeze payload/key/actor/recipient/revision,
persist unresolved receipts in bounded, validated same-tab session storage and
recover only after fresh authenticated ownership checks. Lost responses require
a deliberate retry with the original key/content. Temporary401/403 suspends
protected UI and recovery without deleting the actor receipt. Logout or a
confirmed identity change purges protected state. Storage failure prevents
dispatch. Acknowledgement retires only the captured revision and never converts
a subsequent refresh failure into an unsent message. Explicit resolution of a
known rejection/conflict retires only its receipt and preserves the draft; an
uncertain, pending or suspended receipt cannot be discarded through that action.
Explicit logout revokes browser verification/write generations before awaiting
HTTP and attempts protected-storage cleanup even when a browser cookie or storage
write fails. A noncredential reset UUID cookie, also refreshed by the server
logout response, requires each tab to finish its owned purge before restoring
receipts. Its processed marker is recorded only after successful purge. Missing
or malformed epochs cannot authorize legacy recovery; unavailable epoch/storage
blocks restoration. Old store instances and pending submission metadata belong
to their captured reset generation, including when the same actor signs in again.
Normal temporary expiry/reauthentication does not rotate this logout epoch.
Browser implementation and
actual browser verification remain requirements, not implied by this ADR.

## Alternatives and consequences

Putting receipt columns on Message would mix transport ownership with accepted
author display fields, complicate legacy/system messages and immutable replay
representation. A separate ledger makes that boundary and version explicit at
the cost of one row per keyed message. Redis, process caches and best-effort
fallbacks lose receipts on expiry/restart/outage and cannot commit atomically
with PostgreSQL; they are unsuitable for this guarantee. No cache fallback or
new external provider/outbox is introduced.

Upgrade adds an empty ledger and leaves existing messages unchanged. Never
backfill intents by equal text/time. Database backup/restore must include this
table. Downgrade drops receipts but keeps messages; re-upgrade cannot recover
discarded keys, so retries of old submissions can create another message.
Take a complete backup and stop keyed producers before a downgrade; preserve
the receipt-bearing database for rollback/recovery instead of promising safe
replay after destructive schema removal.

This guarantees one retained database message/effect per scoped intent. It
does not guarantee exactly-once Telegram/email/SMS delivery. ADR0004's
commit-to-local-event-dispatch crash gap remains. Unkeyed producers have no
deduplication guarantee. Client deployment, devices and acceptance stay in#10.
