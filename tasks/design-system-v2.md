# GarageOS design system v2

Implement the supplied design-system v2 specification across the existing staff,
customer Mini App, vehicle/workshop, platform, marketing, public documents and
Flutter surfaces. The product name is GarageOS.

## Design contract

- Cool grey canvas #E4E6E9; solid #F5F6F8 cards, #ECEEF1 nested tiles, frosted
  panels. Obsidian #111315 for navigation and primary controls. Emerald #109868
  for financial/message actions and positive status, with darker text/CTA tone
  where white small text requires AA contrast.
- 28px outer cards, 18px nested tiles, 24px floating dock, 14px icon squares,
  pill buttons and inputs. 18px bento gaps, 24/18/14px padding, 20px mobile gutter.
- Plus Jakarta Sans body, Archivo technical display, IBM Plex Mono telemetry;
  retain Cyrillic fallback and UZ/EN/RU labels. Preserve dark mode with neutral
  dark surfaces and accessible foregrounds.
- Desktop floating navigation and segmented destinations; mobile navigation
  stays reachable. All existing routes, RBAC and API mutations retain their
  behavior. Keyboard focus, empty/error/loading/disabled states remain visible.
- Vehicle schematic and gauges are shared between authenticated inspection and
  the public/customer passport. Only API-provided measurements are displayed.
  Missing metrics are not replaced with demonstration measurements.
- Existing product capabilities determine the content: no fabricated AI, MRR,
  photo upload, payment integration, or support impersonation controls.

## Verification

The shared web foundation covers staff scheduling, CRM, billing, messaging,
operations, reports, settings and existing placeholder routes. Dashboard,
inspection, customer Mini App, platform navigation and public passport layouts
also receive specific compositions. Marketing, login and demo entry use the same
palette and fonts. Native staff, mechanic and customer screens share the Flutter
theme, with vehicle stages in customer cards and workshop details.

The supplied secondary grey needs a darker text variant on the canvas to meet
WCAG AA. Status text likewise uses accessible light/dark variants; the original
palette remains in the exported tokens. White-text financial and send controls
use #0B7E55. Tenant identity metadata and document branding remain; tenant colors
no longer replace the product's primary action semantics.

Vehicle graphics are lightweight generic vector schematics. Measurements and
actions still come from existing APIs. No external image service, new runtime
dependency, fabricated assistant response or backend feature was added.

Font sources: Google Fonts' Plus Jakarta Sans, Archivo and IBM Plex Mono. Web
fonts are served locally through next/font. Native font files and OFL licenses
are bundled for offline use, with Golos Text retained for Cyrillic fallback.

- Production Next.js build and TypeScript checks pass.
- Localization coverage: 1,466 keys across en/ru/uz.
- Flutter analysis: no issues. Full suite: 105 passed, 2 existing skips.
- Native customer and mechanic phone previews were rendered and inspected.
- Browser suite: 35 passed, including responsive/accessibility checks, platform
  permissions, mechanic booking, service completion, UZS invoicing and languages.
- Final customer rerun: 5 passed after the profile wrapping fix and explicit
  conversation-content readiness checks. Production build passed again.
- Browser validation uses an isolated seeded PostgreSQL database and API;
  it does not write to the other checkout's development or production data.

The responsive browser gate covers 320px, 390px, 768px and 1440px layouts,
light/dark themes, UZ/EN/RU, horizontal overflow, WCAG AA checks, mobile navigation
and keyboard selection of vehicle gauges. It waits for loaded content and checks
both incoming and outgoing customer messages.

After the existing private browser fixture setup, run
`python -m tests.support.design_browser` from the backend with the same isolated
environment. This adds one idempotent synthetic conversation to the test database;
it does not change the demo's read-only policy or send external messages. Then run
the `design-system`, `theme-compat`, `platform`, `service-work-invoice` and `i18n`
Playwright specs. Booking regression writes use the existing private owner fixture,
while the demo account is used only for read-only checks.

Implementation is isolated on codex/design-system-v2, based on 25e17b1, while
authentication work continues separately in the original source checkout.
