# Operational case references

Cases belong to the authenticated garage. Staff read/write permissions and the
function-scoped transaction boundary remain unchanged.

New cases require an active customer from that garage. An optional vehicle must
also be active, local, and owned by that customer. Missing, foreign or inactive
references receive a generic404; a known local vehicle belonging to a different
local customer receives422. Assignment requires an active local mechanic with
an active mechanic role, using the same eligibility as the dispatch roster.
Rejected inputs cannot change case status or emit a domain event.

All case reads and mutations require an active local case whose customer,
optional vehicle and optional assigned account still exist in the same garage.
Unsafe historical rows receive404 and are excluded before the existing list
limit60. `active_count` continues to count the safe rows on that limited list;
it is not a whole-garage total. Locally inactive related records remain readable.
A vehicle that legitimately changed local owner does not invalidate its old
case. This readability rule does not establish accurate inactive-vehicle health.

The case conversation entry point checks the case before returning an existing
thread or creating one. An existing thread must independently have local
customer/vehicle/assigned-account references. Participants and messages must
belong to the same garage and thread; participant customer/user references and
message author references must be local. Attachments must belong to the same
garage and agree with their message's conversation in both directions.
Malformed aggregates receive404 without rewriting historical data. Inactive
local children remain readable. Arbitrary text and old unlinked name snapshots
are not retrospectively scrubbed.

The actual authenticated HTTP/PostgreSQL regression seam is
`backend/tests/test_case_reference_safety_api.py`. It keeps foreign keys enabled,
records only event delivery, observes aggregate state through independent
sessions, and checks durability at the first HTTP success send. The shared
transaction fault/retry suite remains `test_transaction_response_api.py`.

General Inbox creation/entry points and other conversation links, complete
Operations paging/search/counts, UI interactions and localization are separate
delivery work. Deployment, device/signing and client acceptance remain in
[issue10](https://github.com/Shoamirg/garageos/issues/10); the case increment and
exact verification evidence belong to
[issue35](https://github.com/Shoamirg/garageos/issues/35).
