# Invoice and estimate issuer

[Issue31](https://github.com/Shoamirg/garageos/issues/31) replaces the fixed demo
workshop identity on billing documents with their owning service center's current
business presentation. Full authenticated and intentionally public UUID detail
responses share `issuer`: name, tagline, monogram, phone and address only.
Brand name and monogram follow existing branding fallbacks. Missing contacts are
omitted from presentation; an older payload without issuer shows the localized
generic garage name without invented contact details.

The lookup uses the document's tenant after existing access checks and selects
only six center columns, without loading its tenant collections. It does not
change authenticated tenant boundaries, public UUID visibility, amounts, payment
idempotency, lifecycle actions or sharing eligibility. The existing public route
continues to expose active documents of an inactive center; staff suspension
continues to reject login. No new settings, table or migration is needed.

This is the current garage profile, **not an immutable historical legal/fiscal
identity snapshot or a cryptographic signature**. Changing branding/contact
fields changes the presentation of older documents too. Private center email,
staff, configuration and credentials are absent from the issuer projection.

Both staff and standalone public views use the same text-only issuer component.
Recorded Unicode/punctuation is preserved and escaped by React. A normally
formatted numeric business phone is a 44px `tel:` target; other recorded phone
text remains plain text. Both public numbers and dates use existing EN/RU/UZ
formatters. Line items scroll inside a phone document rather than widening the
whole page. Print targets retain the existing print stylesheet.

## Verification

`tests/test_document_issuer_api.py` uses migrated PostgreSQL and actual HTTP login
and detail routes. Two garages with invoice/estimate documents cover explicit
branding, name/monogram fallback, absent contacts, exact issuer allowlist,
unchanged financial data, tenant404 and current-profile/public-suspension policy.

`e2e/document-issuer.spec.ts` uses actual production Next/BFF/API paths without
issuer response mocks. EN/RU/UZ ×360/1280 checks both garages and document kinds
in staff/public screen and A4 print media/PDF, literal stored punctuation, short
phone44×44 targets, header bounds and localized numbers/months. Synthetic credentials stay
in the existing private browser fixture, trace recording is disabled, and the
owned test database/private file are removed by the caller's lifecycle.
The existing real-component server/browser feedback checks also verify the
issuer's legacy generic fallback in all three locales, without invented contacts.

The guarded `tests.support.browser_release` command creates these test-only
garages/documents after refusing non-test/non-loopback databases and origins and
output inside the checkout. It exclusively creates the private fixture file;
never copy it into artifacts. This does not enroll a real customer or Telegram
identity. Run the entire configured browser gate and existing backend/Flutter
financial workflows as described in [local Jenkins](../../docs/agents/local-jenkins.md).
Record exact source/results in issue31 and delivery issue10; browser print media
does not prove physical printer or device acceptance.

The staff i18n baseline shrinks from15 to14 entries after manual document-view
review. The unchanged heuristic detects104 residual strings in13 files; another
baseline file contains dynamic copy it cannot detect. Calendar/appointments,
operations/inbox and health/passport remain. Key coverage and the historical
progress percentage do not prove complete translation.
