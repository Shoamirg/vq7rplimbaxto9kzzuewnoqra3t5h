import { Fragment } from "react";
import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { DEMO_HREF, MarketingCta } from "@/components/marketing/chrome";

export const metadata: Metadata = {
  title: "Pricing — GarageOS",
  description: "Simple per-location pricing for independent shops and multi-location groups. Starter, Professional, and Enterprise plans.",
};

// NOTE: illustrative launch pricing — edit these to your final numbers.
const TIERS = [
  { name: "Starter", price: "$79", per: "per location / month", desc: "A single independent shop getting organized.", featured: false,
    features: ["Scheduling & appointments", "Customers & vehicle records", "Vehicle health & passports", "Estimates & invoicing", "Up to 3 staff seats"] },
  { name: "Professional", price: "$149", per: "per location / month", desc: "Busy shops that live in the platform daily.", featured: true,
    features: ["Everything in Starter", "Operations & dispatch", "Unified inbox + Telegram app", "Reports & analytics", "Unlimited staff seats", "Priority support"] },
  { name: "Enterprise", price: "$299+", per: "per location / month", desc: "Groups running several sites on one system.", featured: false,
    features: ["Everything in Professional", "Multiple locations & branding", "Consolidated reporting", "Onboarding & data import", "Custom domain", "Dedicated success contact"] },
];

const COMPARISON: Array<{ group: string; rows: Array<[string, boolean | string, boolean | string, boolean | string]> }> = [
  { group: "Core", rows: [
    ["Scheduling & calendar board", true, true, true],
    ["Customers & vehicles", true, true, true],
    ["Vehicle maintenance health & service record", true, true, true],
    ["Estimates, invoices & payments", true, true, true],
    ["Staff seats", "3", "Unlimited", "Unlimited"],
  ]},
  { group: "Operate & engage", rows: [
    ["Operations & dispatch", false, true, true],
    ["Unified inbox", false, true, true],
    ["Telegram customer app", false, true, true],
    ["Reports & analytics", false, true, true],
  ]},
  { group: "Scale", rows: [
    ["Multiple locations", false, false, true],
    ["White-label branding", "Basic", "Basic", "Full"],
    ["Custom domain", false, false, true],
    ["Onboarding & data import", "Self-serve", "Self-serve", "Assisted"],
    ["Support", "Email", "Priority", "Dedicated"],
  ]},
];

const FAQ = [
  ["How is GarageOS priced?", "Per location, per month. Each physical shop is one location; add more as you grow. Book a demo and we'll confirm the right plan for your operation."],
  ["Is there a setup fee?", "No. There are no setup fees to get started. Enterprise plans include assisted onboarding and data import at no extra charge."],
  ["Can I try it first?", "Yes — explore the full platform right now in our live, read-only demo, no signup required. For your own data, book a walkthrough."],
  ["Do you support multiple locations?", "Yes. The Enterprise plan runs several sites on one system with consolidated reporting and per-location branding."],
  ["What about my customer and vehicle data?", "It's yours. You can export it at any time, and every tenant's data is isolated by design. See the Security page for details."],
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check size={17} aria-label="Included" />;
  if (v === false) return <Minus size={16} style={{ color: "#3c4a63" }} aria-label="Not included" />;
  return <span>{v}</span>;
}

export default function PricingPage() {
  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> Pricing</span>
          <h1 className="mkt-display mkt-page-title">Pricing that grows with the shop</h1>
          <p className="mkt-page-sub">Straightforward per-location pricing. Start with one shop and scale to a whole group — no setup fees, cancel anytime.</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 40 }}>
        <div className="mkt-shell">
          <div className="mkt-tiers">
            {TIERS.map((t) => (
              <div className={`mkt-tier${t.featured ? " mkt-tier--featured" : ""}`} key={t.name}>
                {t.featured ? <span className="mkt-tier__badge">Most popular</span> : null}
                <div className="mkt-tier__name">{t.name}</div>
                <div className="mkt-tier__price">{t.price} <span>{t.per}</span></div>
                <p className="mkt-tier__desc">{t.desc}</p>
                <ul className="mkt-tier__list">
                  {t.features.map((f) => (<li key={f}><Check size={16} /> {f}</li>))}
                </ul>
                <a href={DEMO_HREF} className={`mkt-btn ${t.featured ? "mkt-btn--primary" : "mkt-btn--ghost"}`}>Book a demo</a>
              </div>
            ))}
          </div>
          <p className="mkt-price-note">Prices in USD, billed per location. Annual billing available. Book a demo to confirm your plan.</p>

          {/* Comparison */}
          <div className="mkt-section__head" style={{ margin: "80px auto 0", textAlign: "center", maxWidth: 640 }}>
            <h2 className="mkt-display mkt-h2" style={{ margin: "0 auto" }}>Compare plans</h2>
          </div>
          <div className="mkt-table-wrap" tabIndex={0} role="region" aria-label="Plan comparison">
            <table className="mkt-table">
              <thead>
                <tr><th>Feature</th><th>Starter</th><th>Professional</th><th>Enterprise</th></tr>
              </thead>
              <tbody>
                {COMPARISON.map((section) => (
                  <Fragment key={section.group}>
                    <tr className="mkt-table__group"><td colSpan={4}>{section.group}</td></tr>
                    {section.rows.map((r) => (
                      <tr key={r[0] as string}>
                        <th scope="row">{r[0]}</th>
                        <td><Cell v={r[1]} /></td>
                        <td><Cell v={r[2]} /></td>
                        <td><Cell v={r[3]} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* FAQ */}
          <div className="mkt-section__head" style={{ margin: "80px auto 0", textAlign: "center", maxWidth: 640 }}>
            <h2 className="mkt-display mkt-h2" style={{ margin: "0 auto" }}>Pricing questions</h2>
          </div>
          <div className="mkt-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta />
    </>
  );
}
