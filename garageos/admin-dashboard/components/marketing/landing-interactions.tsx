"use client";

import { useState } from "react";
import { ArrowRight, Check, FileCheck2, FileText, Building2, Users, Rocket } from "lucide-react";
import { DEMO_HREF } from "@/components/marketing/chrome";
import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

export function EstimatePreview() {
  const { messages: { landing: { estimate: t } } } = useMarketingI18n();
  const [approved, setApproved] = useState(false);
  const Icon = approved ? FileCheck2 : FileText;
  return (
    <div className="mkt-home__estimate" data-approved={approved}>
      <Icon className="mkt-home__estimate-icon" size={30} aria-hidden="true" />
      <h3>{t.title}</h3><p>{t.label}</p>
      <div className="mkt-home__estimate-item"><span>{t.item}</span><strong>{t.amount}</strong></div>
      <p className="mkt-home__estimate-status" data-testid="estimate-status" role="status">{approved ? t.approved : t.pending}</p>
      <button className="mkt-home__button mkt-home__button--dark" type="button" aria-pressed={approved} onClick={() => setApproved(!approved)} data-testid="estimate-toggle">
        {approved ? t.reset : t.approve}<Check size={16} aria-hidden="true" />
      </button>
      <small>{t.disclaimer}</small>
    </div>
  );
}

const PLAN_ICONS = [Building2, Users, Rocket];

export function PricingPreview() {
  const { locale, messages: { landing: { pricing: t } } } = useMarketingI18n();
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  return (
    <section className="mkt-home__pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="mkt-shell">
        <div className="mkt-home__pricing-heading">
          <div className="mkt-home__section-heading">
            <span className="mkt-home__eyebrow"><span />{t.eyebrow}</span>
            <h2 id="pricing-title">{t.title}</h2>
          </div>
          <div className="mkt-home__currency" role="group" aria-label={t.currency}>
            {(["UZS", "USD"] as const).map((value) => <button type="button" key={value} aria-pressed={value === currency} onClick={() => setCurrency(value)}>{value}</button>)}
          </div>
        </div>
        <div className="mkt-home__pricing-cards" data-testid="marketing-pricing-carousel">
          {t.plans.map((plan, index) => {
            const Icon = PLAN_ICONS[index];
            const subject = encodeURIComponent(`GarageOS quote: ${plan.title} (${currency})`);
            const href = `${DEMO_HREF.split("?")[0]}?subject=${subject}&body=${encodeURIComponent(`Currency: ${currency}\nLanguage: ${locale}`)}`;
            return (
              <article className="mkt-home__price-card" key={plan.title}>
                <Icon size={22} aria-hidden="true" /><h3>{plan.title}</h3><p>{plan.label}</p>
                <div className="mkt-home__price" aria-live="polite">{t.onRequest}<small>{currency}</small></div>
                <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
                <a href={href} className="mkt-home__button mkt-home__button--dark" data-testid="pricing-enquiry">{t.quote}<ArrowRight size={16} aria-hidden="true" /></a>
              </article>
            );
          })}
        </div>
        <p className="mkt-home__pricing-note">{t.note}</p>
      </div>
    </section>
  );
}
