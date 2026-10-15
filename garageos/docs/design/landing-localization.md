# Compact multilingual landing

The public home page uses an alabaster canvas and a photographic vehicle showroom.
Its default language is Uzbek; the header selector also offers Russian and
English. `garageos-marketing-locale` stores only the marketing preference.
Blocked or invalid local storage falls back to Uzbek without disabling the
selector. Dashboard authentication and language settings are separate.

## Reference design system

The owner's `4994.jpg` and `4995.jpg` references use a continuous grey canvas,
slightly raised tonal cards, compact controls, a large real vehicle image, and
green action/status accents. GarageOS adapts those patterns to a service workflow;
the rental, payment-card, and AI-chat features in the references are not offered
by this preview.

| Token | Value / purpose |
| --- | --- |
| Canvas | `#e8e9e7` |
| Surface | `#eff0ee` |
| Main text | `#182022` |
| Secondary text | `#505b5d` |
| Action / selected state | `#087951` |
| Card radius | 20px; controls 10–14px |
| Elevation | Soft opposing light/shadow; no heavy outlines |
| Type | Manrope headings at 600–650 weight; Inter body |

The scoped tokens and component rules in `marketing.css` replace the accumulated
home-page overrides. Dashboard and dark content-page styles stay separate.
The hero's service panel links to real sections and the existing demo. Its
displayed work changes with the shop selector; it is labelled as sample content.

The original inline SVG car is replaced by a locally hosted Hyundai Sonata
studio photograph (2400px, approximately 125KiB). The source and license are
recorded in `admin-dashboard/public/marketing/PHOTO-CREDITS.md`; visible credit
links to the source. CSS frames the image and blends its white background with
the canvas without altering the downloaded photo or suggesting manufacturer
endorsement. The photo loads with priority directly from the static CDN using
Next Image's per-image `unoptimized` option. The already compact 125KiB file
does not depend on the deployment's image function, which returned HTTP 400
for this local asset and the existing dashboard/passport screenshots during
the live smoke check. The landing's product screenshots also use direct static
delivery and remain lazy; image behavior elsewhere is unchanged.

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
