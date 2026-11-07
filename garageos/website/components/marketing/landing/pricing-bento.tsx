"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { useLanding } from "@/components/marketing/landing/use-landing";
import { trialRequestHref } from "@/lib/marketing-i18n";

type Currency = "UZS" | "USD";
const POPULAR = 1;

/** Section 5: currency toggle + three plans (snap carousel on phones, centred on the popular plan). */
export function PricingBento() {
  const { locale, t: { pricing: t } } = useLanding();
  const [currency, setCurrency] = useState<Currency>("UZS");
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.current;
    const popular = element?.children[POPULAR] as HTMLElement | undefined;
    if (!element || !popular || element.scrollWidth <= element.clientWidth) return;
    element.scrollLeft = popular.offsetLeft - (element.clientWidth - popular.offsetWidth) / 2;
  }, []);

  return (
    <section className="lp-section lp-shell" id="pricing" aria-labelledby="pricing-title">
      <div className="lp-pricing__head">
        <h2 id="pricing-title" className="lp-display lp-section__title">{t.heading}</h2>
        <div className="lp-seg" role="group" aria-label={t.currencyLabel}>
          {(["UZS", "USD"] as const).map((code) => (
            <button key={code} type="button" aria-pressed={currency === code} aria-label={code} onClick={() => setCurrency(code)}>
              {t.currencies[code]}
            </button>
          ))}
        </div>
      </div>
      <div className="lp-scroller lp-plans" ref={track} data-testid="marketing-pricing-carousel">
        {t.plans.map((plan, index) => (
          <article key={plan.name} className={`lp-plan ${index === POPULAR ? "lp-plan--popular" : ""}`}>
            <header>
              <h3>{plan.name}</h3>
              {index === POPULAR ? <span className="lp-pill lp-pill--emerald">{t.popular}</span> : <small>{plan.sub}</small>}
            </header>
            <p className="lp-plan__price" aria-live="polite">
              <strong>{plan[currency]}</strong>
              <small>{currency === "UZS" ? `${t.uzsUnit} ` : ""}{t.perMonth}</small>
            </p>
            <ul>
              {plan.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}
            </ul>
            <a className={`lp-btn lp-btn--block ${index === POPULAR ? "lp-btn--emerald" : "lp-btn--obsidian"}`}
              href={trialRequestHref(locale, `Plan: ${plan.name} (${currency})`)} data-testid="pricing-enquiry">
              {t.cta}<ArrowRight size={16} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
