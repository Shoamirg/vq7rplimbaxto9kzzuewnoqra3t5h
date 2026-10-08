# Operational appointments queue

[Issue33](https://github.com/Shoamirg/garageos/issues/33) covers the existing
tenant queue at `/appointments`. Each real appointment appears once: phone
cards and desktop columns expose full escaped customer/vehicle/service/mechanic
text, date/time, duration, state, computed health and linked billing. Wide
desktop columns scroll inside the records panel. EN/RU/UZ chrome and dynamic
copy use the shared dictionaries and formatters; stored free text stays literal.
Only the reviewed appointments-list baseline entry is removed. Twelve entries
remain for operations/inbox/health/passport; the heuristic finds83 strings in11
files. The995-key dictionary check and audit do not prove every dynamic string
or complete localization of those remaining modules.

Search remains server-side, debounced250ms, bounded100 characters and paged15
records. Today/Tomorrow/Next7days use the existing browser-local inclusive date
bounds; Next7days means today through today+6. The calendar retains its separate
UTC/Monday-week policy. Summary/tab counts describe all active appointments in
the tenant, independent of search/date/page; Today uses the server's date. Its
query now excludes inactive appointments, as the other status counters do.

The existing appointment update PATCH commits its tenant transaction before
sending success. A failed commit returns an error and rolls back; immediate
calendar/queue reads cannot treat a merely flushed update as saved. Its
response, date and UUID assignment contracts stay the same. This guarantee
is verified for this endpoint; other write endpoints need a separate review.

Only successfully loaded visible current-page records can be selected. Query,
date, status, page, pending load and failed-read transitions clear or suspend
selection. Select-all means this page. Locale-only changes preserve the query,
page and selection. Bulk confirm sends pending records; bulk cancel sends only
pending/confirmed records. Actual successes, API failures and ineligible selected
records are reported separately. A pending mutation blocks overlapping dispatch;
the server still decides eligibility after competing changes. Actions refresh
the real list and whole-tenant summary. Native work access remains tied to the
stored mechanic UUID.

List and summary have separate loading/error/retry states. Request generations
ignore obsolete responses. A failed read cannot present previous rows as a new
query, show an ordinary empty list, or manufacture zero summary counts. Real
booking/edit/completion/invoice forms retain their state and financial contracts.
The appointment invoice's customer/vehicle binding, line validation, discounts,
totals, currency and create body are unchanged by its44px presentation changes.

## Verification seams

`tests/test_appointment_queue_api.py` verifies active-only own/foreign summary
counts through actual HTTP and migrated PostgreSQL.
The same tests observe the first success response send with a separate PG
session and force a commit failure to check that no success is sent and the
stored appointment remains unchanged. Ordinary completed ASGITransport requests
alone would wait for dependency cleanup and miss success-before-commit.
The browser fixture prepares
owned legacy records only after the existing loopback/test/debug/key/output
guards; its private credentials are never archived.

`e2e/queue-matrix.spec.ts` covers EN/RU/UZ at360/1280, long Unicode rows, real
pagination/date/status/search, page selection, locale retention, keyboard/menu
targets and a real competing cancellation producing partial bulk failure.
`queue-workflow.spec.ts` uses actual booking/edit/account-native work/completion,
appointment invoice binding, validated lines/totals and recorded payment states.
`queue-loading.spec.ts` delays real responses or injects transport503 only to
exercise presentation. Its explicitly labelled missing-enrichment case removes
only optional health fields from one fetched persisted row, retaining all other
records/counts/state/billing fields. It creates no health score and proves UI
robustness, not a natural backend-null condition. Untouched inactive-vehicle API
data still means0/poor under the existing health contract.

Whole-page axe scans retain every rule and violation. The invoice dialog's known
inconclusive hidden-background focus result is checked with actual bidirectional
Tab trapping; unknown inconclusive rules still fail. Screenshot/dynamic-copy
review and44px target checks complement automation. Client physical-device,
assistive-technology, production and pilot acceptance remain separate gates.
