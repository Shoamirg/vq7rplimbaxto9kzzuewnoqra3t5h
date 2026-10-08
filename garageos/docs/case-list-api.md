# Complete operational case list reads

`GET /api/v1/cases` remains an authenticated staff read. Tenant and active-case
reference rules from [case references](case-reference-safety.md) apply before
search, counts and pages, including local inactive related history and locally
transferred vehicles. The endpoint emits no domain event and does not mutate
cases or threads. Mechanic/customer access and demo read-only policy are unchanged.

Query parameters:

| Parameter | Default | Contract |
| --- | --- | --- |
| `status` | `active` | Existing active/resolved grouping; other values leave the status filter unset. |
| `type` | unset | Existing exact type filter; unset/`all` leaves it unset. |
| `q` | unset | Trimmed, case-insensitive literal substring of code, title or local customer name. Maximum200 input characters. `%`, `_` and `\` are literal; whitespace-only is no search. |
| `limit` | 60 | Integer1..100; invalid values receive422. |
| `offset` | 0 | Integer0..2147483647; invalid/oversized values receive422. |

The response preserves `items` and adds `total`, `limit`, `offset`.
`total` is the complete safe result count for the current status/type/q filters.
`active_count` counts existing open statuses in that same filtered result before
pagination. It is no longer the count of only the first60 rows. Resolved-group
active_count is0; an empty beyond-end page still returns both complete counts.
Unknown legacy statuses can belong to the active group without satisfying
`is_open`, preserving the model's existing distinction.

Items are ordered by created_at descending, then UUID descending. A stable
dataset can be traversed without tie duplicates or omissions. Separate offset
requests do not freeze a snapshot while cases change. Counts and items are
current reads, not a transactional snapshot across requests.

Page labels use scalar joins without loading customer vehicle/appointment or
vehicle service-record/catalog collections. Active local vehicle labels preserve
brand/model/plate formatting without year; an inactive vehicle has a null label,
and an absent vehicle preserves the absence of the vehicle_label field. Detail,
health, conversation, assignment and status-write contracts are unchanged.

## Search runtime preflight

Nonempty text search requires the predefined deterministic ICU collation
`pg_catalog."und-x-icu"`. The read checks its trusted schema, ICU provider,
determinism and encoding compatibility before querying. Missing/incompatible
capability receives structured503 with error code `CASE_SEARCH_UNAVAILABLE`.
There is no ASCII-only fallback; listing without a query remains available.
The application does not create collations or change database locale defaults.

Operators can run this read-only query against the intended database:

```sql
SELECT c.collname, c.collprovider, c.collisdeterministic, c.collencoding,
       c.collencoding IN (-1, d.encoding)
       AND pg_catalog.to_regcollation('pg_catalog."und-x-icu"') = c.oid
       AS encoding_compatible
FROM pg_catalog.pg_collation c
JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace
JOIN pg_catalog.pg_database d ON d.datname = current_database()
WHERE n.nspname = 'pg_catalog' AND c.collname = 'und-x-icu';
```

It must return ICU provider `i`, deterministic true and encoding_compatible true.
Actual collation resolution is required: a catalog encoding of -1 alone does
not mean ICU supports every database encoding.
[PostgreSQL locale](https://www.postgresql.org/docs/16/locale.html) and
[collation](https://www.postgresql.org/docs/16/collation.html) documentation explain
locale-dependent case behavior. Owned native PostgreSQL18.3 and Linux16.15 SQL
probes support the chosen collation, including Russian/Uzbek letter case; this
does not promise normalization, accent removal, transliteration or every Unicode
casefold rule. The actual HTTP regression suite includes a controlled rename and
restore of the collation only in the dedicated `garage_test` QA database.
An additional owned SQL_ASCII database exercises real password-authenticated
HTTP search503 and usable no-search listing; it is removed after that regression.

## Verification and remaining work

`backend/tests/test_case_list_api.py` uses real password identities, HTTP and
PostgreSQL with foreign keys and UnitOfWork enabled. It covers complete traversal,
filters/counts, literal multilingual search, unsafe references, history/labels,
permissions, no read events and bounded request SQL. These are regression bounds,
not proof of agreed client workload/network latency.

The dashboard still needs to consume server paging/search/counts. Its current
first-page client filtering cannot find every old case. Paging controls, stale
selection/detail/thread responses, mutation guards, failed-send drafts, phone
layout and localization are follow-up work. General Inbox references and the
client deployment/device/pilot gates remain tracked in
[delivery issue10](https://github.com/Shoamirg/garageos/issues/10).
Implementation and exact verification for this API increment belong to
[issue36](https://github.com/Shoamirg/garageos/issues/36).
