# Staff feedback localization

[Issue30](https://github.com/Shoamirg/garageos/issues/30) completes the notification
menu, calendar/dashboard contextual errors and calendar/dashboard/vehicle-health/
vehicles loading skeletons in EN/RU/UZ. Locale changes retain notification filter,
polling and read behavior. Category IDs and routes stay in their API form; stored
notification titles/bodies and customer/garage names are not machine translated.
Relative timestamps retain existing rounding/yesterday behavior; invalid dates
show a dash. Counts and Russian plural forms follow the active locale.

Loading roots use named `status` roles with their existing busy state, following
[WAI-ARIA status semantics](https://www.w3.org/TR/wai-aria-1.2/#status).
The notification menu fits phone/desktop widths, retains Escape focus return,
and its filter/read controls meet the existing 44px target policy.

## Verification

Run the entire configured production browser suite with the private prerequisites
in [local Jenkins](../../docs/agents/local-jenkins.md). The added
`e2e/feedback-localization.spec.ts` includes:

- Six actual production dashboard/notification states: EN/RU/UZ ×360/1280.
  Login, application shell and locale cookie are real. Notification feed data is
  an explicit presentation fixture for deterministic ages, counts and empty
  states. Assertions cover the initial production loading label before hydration,
  localized UI, unchanged stored messages, invalid dates, menu bounds and focus.
- A locale transition that retains the selected filter and verifies the read-all
  request/action using the presentation fixture. These intercepted requests do
  not prove live notification persistence or authorization.
- Three real component server renders, using actual React/context/design-system
  modules in a separate Node process. Browser role/name assertions verify four
  loading statuses; contextual errors retain localized titles/descriptions and
  retry controls. This does not force actual route failures or verify a physical
  screen reader. Existing route reset handlers are retained.
- Audit reporting consistency between ordinary and `--all` modes.

The original functional/accessibility suite remains configured and runs alongside
these checks. Disable auth traces and remove owned test services/private fixtures
afterward. Exact source/CI results belong in issue30 and delivery issue10.

## Remaining localization

After this slice the unchanged heuristic detects106 residual strings in14 files,
with15 files still on its baseline (one contains dynamic strings it cannot see).
Calendar/appointments, operations/inbox, health, billing and passport remain.
The audit matches selected JSX text/attributes; it misses some expressions,
toasts and mixed lines. Its progress percentage is a historical string counter,
not proof of complete UI translation. `i18n:check` verifies key coverage only.
Do not remove a baseline entry or add an exclusion to disguise untranslated UI.

Client hosting/accounts, backups/rollback, owner signing, physical devices and
pilot acceptance remain separate gates in
[issue10](https://github.com/Shoamirg/garageos/issues/10).
