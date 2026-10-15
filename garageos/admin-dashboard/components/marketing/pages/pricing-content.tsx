"use client";

import { Fragment } from "react";
import { Check, Minus } from "lucide-react";

import { MarketingCta, useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";
import { RichText } from "@/components/marketing/pages/rich-text";
import { landingMessages } from "@/lib/marketing-landing-copy";
import { trialRequestHref } from "@/lib/marketing-i18n";
import { pricingMessages } from "@/lib/marketing-pricing-copy";

const POPULAR = 1;

function Cell({ v, included, notIncluded }: { v: boolean | string; included: string; notIncluded: string }) {
  if (v === true) return <Check size={17} aria-label={included} />;
  if (v === false) return <Minus size={16} style={{ color: "#3a423e" }} aria-label={notIncluded} />;
  return <span>{v}</span>;
}

export function PricingContent() {
  const { locale } = useMarketingI18n();
  const t = pricingMessages[locale];
  const shared = landingMessages[locale].pricing;
  const names = shared.plans.map((plan) => plan.name);

  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> {t.eyebrow}</span>
          <h1 className="mkt-display mkt-page-title">{t.title}</h1>
          <p className="mkt-page-sub">{t.sub}</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 40 }}>
        <div className="mkt-shell">
          <div className="mkt-tiers">
            {shared.plans.map((plan, index) => {
              const featured = index === POPULAR;
              const detail = t.plans[index];
              return (
                <div className={`mkt-tier${featured ? " mkt-tier--featured" : ""}`} key={plan.name}>
                  {featured ? <span className="mkt-tier__badge">{shared.popular}</span> : null}
                  <div className="mkt-tier__name">{plan.name}</div>
                  <div className="mkt-tier__price">{plan.UZS} <span>{shared.uzsUnit} {shared.perMonth} · {plan.USD}</span></div>
                  <p className="mkt-tier__desc">{detail.desc}</p>
                  <ul className="mkt-tier__list">
                    {detail.features.map((f) => (<li key={f}><Check size={16} /> {f}</li>))}
                  </ul>
                  <a href={trialRequestHref(locale, `Plan: ${plan.name}`)} className={`mkt-btn ${featured ? "mkt-btn--primary" : "mkt-btn--ghost"}`}>{shared.cta}</a>
                </div>
              );
            })}
          </div>
          <p className="mkt-price-note">{t.note}</p>

          {/* Comparison */}
          <div className="mkt-section__head" style={{ margin: "80px auto 0", textAlign: "center", maxWidth: 640 }}>
            <h2 className="mkt-display mkt-h2" style={{ margin: "0 auto" }}>{t.compareTitle}</h2>
          </div>
          <div className="mkt-table-wrap">
            <table className="mkt-table">
              <thead>
                <tr><th>{t.featureHeader}</th>{names.map((name) => <th key={name}>{name}</th>)}</tr>
              </thead>
              <tbody>
                {t.comparison.map((section) => (
                  <Fragment key={section.group}>
                    <tr className="mkt-table__group"><td colSpan={4}>{section.group}</td></tr>
                    {section.rows.map((r) => (
                      <tr key={r[0]}>
                        <th scope="row">{r[0]}</th>
                        {[r[1], r[2], r[3]].map((v, i) => (
                          <td key={names[i]}><Cell v={v} included={t.included} notIncluded={t.notIncluded} /></td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* FAQ */}
          <div className="mkt-section__head" style={{ margin: "80px auto 0", textAlign: "center", maxWidth: 640 }}>
            <h2 className="mkt-display mkt-h2" style={{ margin: "0 auto" }}>{t.faqTitle}</h2>
          </div>
          <div className="mkt-faq">
            {t.faq.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p><RichText text={a} /></p></details>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta />
    </>
  );
}
