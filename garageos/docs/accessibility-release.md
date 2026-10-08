# Browser accessibility release spot-check

The release gate uses `admin-dashboard/e2e/accessibility.spec.ts` alongside the
original functional suite. Run the complete configured suite against the owned
production Next/API/PostgreSQL fixture described in
[local Jenkins](../../docs/agents/local-jenkins.md). Keep synthetic launch data
private and run with `--retries=0 --trace=off`.

## Scope and evidence

The selected surfaces are Mini home and roadside, staff customer list and
new-customer dialog, and their shared navigation. The matrix covers EN/RU/UZ,
360/1280 CSS-pixel widths and staff light/dark themes. Forms are filled to expose
enabled controls but are never submitted by these accessibility tests.

Pinned `@axe-core/playwright`/axe-core4.13 scans use WCAG2A/AA,2.1A/AA and2.2AA
tags on the whole rendered page without exclusions, disabled rules or accepted
violations. Actual Tab/Shift+Tab/Enter/Escape checks cover visible focus, closed
phone navigation, modal autofocus/trap/return and keyboard actions. Every
visible enabled standalone control must measure at least44×44 CSS pixels,
including controls below the fold. The [44-pixel project target](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
is stronger than the WCAG2.2AA target-size requirement.

Reduced-motion checks hold the actual Mini pointer down without activating its
action, check both computed transform and independent CSS scale, and measure phone-menu and dialog
content/overlay animation and transition durations. Dialog Escape/focus return
is repeated with the preference active. A separate regression rejects
transparent, inset and blur-only shadows as visible focus indicators; another
rejects unintended independent CSS active scaling. A rendered
brand-color probe independently scans primary-button text for blue, yellow,
white, black, gray and orange; it does not mutate any tenant's stored branding.

The pre-fix production baseline at65dfd09e1e10 recorded12 rendered states with
screenshots: Mini home/roadside at both widths and staff list/dialog at both
widths/themes. Supported failures included2.51–2.60:1 Mini labels, blocked zoom,
an invalid toast naming attribute,2.87:1 dark customer initials,24–40px staff
controls, keyboard access to a closed offscreen phone rail, focus returning to
the document body after dialog Escape, and150ms dialog entrance animation with
reduced motion. The new focused tests initially failed on zoom and staff
ARIA/contrast. Dated local results and exact-commit Jenkins receipts live in
[issue29](https://github.com/Shoamirg/garageos/issues/29); a previous functional
CI pass is not an accessibility pass.

## Inconclusive scans and visual review

Automated checks cannot establish accessibility by themselves. Follow the
[Playwright accessibility guidance](https://playwright.dev/docs/accessibility-testing)
and review the selected screens with keyboard and assistive technology on the
client's actual devices before acceptance.

Each passing scan writes an `*-accessibility-review.json` attachment. An unknown
inconclusive rule fails the gate. Known contrast uncertainties receive computed
evidence using browser-resolved colors, alpha compositing and WCAG relative
luminance, with a4.5:1 text threshold:

- SOS/roadside gradients: sample21 points between the actual two Tailwind stops
  in the declared Oklab interpolation space; unexpected interpolation or a third
  stop requires review. See [CSS Color4 interpolation](https://www.w3.org/TR/css-color-4/#interpolation).
- Health-ring text: verify its bounding corners lie inside the empty center,
  away from the SVG stroke, then measure the underlying background. Adjacent
  icons and opaque badges are distinguished from overlapping transparent text.
- Short initials/unread counts: measure their actual painted foreground and
  composited solid background rather than accepting axe's short-text uncertainty.
- Dialog background/focus guards: allow an inconclusive `aria-hidden-focus`
  result only in the open-dialog state, where actual bidirectional keyboard
  traversal must remain inside the dialog.

Inspect screenshots for localized text clipping/overlap and visible focus on
phone and desktop, in both staff themes. Sampling and this spot-check cover the
named states; they do not prove all gradients, dynamic data, routes, browsers or
assistive-device combinations satisfy [WCAG2.2](https://www.w3.org/TR/WCAG22/).
Retain physical-device/assistive-technology and client-pilot gates in
[HANDOFF.md](HANDOFF.md). Synthetic Mini launch authentication does not validate
an actual Telegram bot/client launch.
