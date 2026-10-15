# Compact multilingual landing

The public home page keeps the existing alabaster canvas and vehicle showroom.
Its default language is Uzbek; the header selector also offers Russian and
English. `garageos-marketing-locale` stores only the marketing preference.
Blocked or invalid local storage falls back to Uzbek without disabling the
selector. Dashboard authentication and language settings are separate.

On screens below 768px, capability tiles and vehicle metadata use two columns.
Shop chips, role tabs and pricing cards scroll horizontally with scroll snapping.
All choices work with a keyboard; role tabs support arrows, Home and End.
The fixed mobile enquiry bar reserves footer space and respects the safe area.

The shop selector changes sample work. Estimate approval is an explicitly
labelled local preview and writes no business data. UZS/USD selects the currency
requested in a pricing email; it does not invent prices or exchange rates.
Screenshots contain English sample content and are labelled accordingly.

The owner requested a **14-day trial enquiry**, not automatic signup. The mobile
CTA opens an email draft addressed to the existing marketing contact, with a
trial request subject. It sends nothing automatically. Trial fulfilment and
commercial terms must be agreed with the team. No payment card promise is made.

Existing content pages remain English with explicit language markup; their
navigation and shared CTA follow the selected marketing language. The separate
legacy `/pricing` page still contains illustrative prices and needs commercial
review before those figures can be treated as approved offers.

Verification: `e2e/landing.spec.ts` exercises language persistence, shop/role
selection, local estimate approval, quote currency, mobile enquiry, layout at
320/390/768/1024/1440px, and WCAG A/AA checks for all three languages. These checks
cover the landing UI; they do not assert Railway/database readiness or trial
provisioning.
