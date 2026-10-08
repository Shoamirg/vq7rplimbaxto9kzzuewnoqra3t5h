# Calendar periods and mechanic assignments

[Issue32](https://github.com/Shoamirg/garageos/issues/32) finishes the staff
calendar's Day, Monday-based Week and complete-week Month views using the
existing tenant-scoped range API. The selected date survives mode/locale changes;
previous/next follows the current period. Today uses the existing UTC date policy.
Month overflow opens the full Day. Loading/error/retry states hide old-period
cards and request generations ignore late responses from obsolete ranges.

The API still excludes cancelled appointments by default. Staff may explicitly
include active cancelled records through the labelled toggle; details remain
read-only and cancellation never occupies a mechanic slot. Existing role,
tenant, 90-day range and appointment-state checks remain authoritative.

Active account lanes use mechanic UUIDs. Duplicate display names have stable
ordinals; stored name-only or unrostered assignments appear in explicit legacy
lanes. A time/duration/next-day move within the assignment omits assignment fields,
preserving the native mechanic's work access. Explicit reassignment sends the
chosen active UUID, while explicit unassignment clears both UUID and name. The
calendar applies the actual PATCH response and reloads its entire active period.
Legacy-name conflicts remain conservative and the server decides final validity.

Day records outside 08:00–18:00 and overlapping records have a separate labelled
list so every record can be opened once. Eligible visits can use the real Edit
form. These display boundaries do not restrict API opening hours or prove spare
workshop capacity. Schedule totals describe recorded minutes, not utilization.

All appointment states open a named, trapped inspector. Its language picker can
change EN/RU/UZ without losing the selection. Contact actions use recorded
tenant-owned phone/Telegram username only; missing contacts and load failures
have honest explanations, retry and a customer-profile link. Ordinary tel/t.me
links do not send messages or provision a Telegram identity. Real Edit, Complete,
New booking and collision dialogs retain state rules, Escape/focus return and
44px controls. Global shortcuts ignore input and modal interaction.

Calendar chrome, dates, durations, numbers and dynamic notifications use the
existing locale dictionaries/formatters. ToastProvider notifications have opaque
card backgrounds and localized 44px dismiss controls so underlying schedule text
cannot reduce their contrast. Remaining staff modules need their own localization
work; dictionary coverage and the audit heuristic do not prove full translation.
At the issue32 boundary, removing the completed calendar entry after manual
review left13 baseline entries and85 heuristic strings in12 files. The later
[operational queue increment](appointments-queue.md) records the appointments
follow-up; operations/inbox and health/passport remain separate work.

## Verification seams

`tests/test_calendar_period_api.py` uses migrated PostgreSQL and actual HTTP
tenant/account reads, scheduling changes and native mechanic visibility. Existing
calendar/assignment/financial/Flutter suites retain their previous contracts.

`e2e/calendar-periods.spec.ts` covers actual range reads, pointer retention,
overlapping records and a stored duration above 240 minutes. The six-case
`e2e/calendar-matrix.spec.ts` covers EN/RU/UZ at 360/1280 widths, real ranges,
all-state details, same-name accounts, off-grid editing, drag/resize, native
reassignment/unassignment, legacy collisions, next-day moves, actual booking,
locale/selection retention, geometry, keyboard and accessibility receipts.
Its separate cross-account collision regression proves that Keep preserves the
original assignee and Next day preserves the explicitly chosen new assignee.

`e2e/calendar-loading.spec.ts` separately controls response latency and 503
presentation failures. Successful responses and appointment data remain real
BFF/API/database reads; obsolete Day/date requests are released after newer
periods, and retry must restore actual health/contact/calendar/roster data with
44px recovery controls.

The existing guarded `tests.support.browser_release` fixture adds two synthetic
calendar customers/vehicles and historical rescheduled visits per test garage.
It refuses unsafe database/origin/debug/output settings before creation, keeps
credentials outside the checkout, and records no auth traces. The caller owns
and removes the entire private QA database/file at the increment boundary.
Run every configured browser spec and the complete local Jenkins gate as
described in [local Jenkins](../../docs/agents/local-jenkins.md). Exact-source
results and remaining acceptance belong in issue32 and delivery10.

Browser automation and screenshots do not establish physical assistive-device,
workload, timezone-policy or real-client deployment acceptance. No schema
migration, scheduler dependency or production identity is introduced.
