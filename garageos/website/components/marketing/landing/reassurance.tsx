"use client";

import { ArrowRight, BadgeCheck, DatabaseBackup, Download, Gift, LockKeyhole, ShieldCheck } from "lucide-react";

import { useLanding } from "@/components/marketing/landing/use-landing";
import { RichText } from "@/components/marketing/pages/rich-text";
import { MARKETING_LINKS, trialRequestHref } from "@/lib/marketing-i18n";
import { pricingMessages } from "@/lib/marketing-pricing-copy";

// Order matches `trust.items` in lib/marketing-landing-copy.ts.
const TRUST_ICONS = [Gift, BadgeCheck, Download, DatabaseBackup, ShieldCheck, LockKeyhole];

/**
 * Why it is safe to start. Every point restates a commitment already made on
 * /pricing (trial, no setup fee) or /security (data ownership, backups,
 * isolation, encryption) — no new claims, no invented testimonials.
 */
export function TrustSection() {
  const { href, t: { trust } } = useLanding();
  return (
    <section className="lp-section lp-shell" id="trust" aria-labelledby="trust-title">
      <p className="lp-kicker">{trust.kicker}</p>
      <h2 id="trust-title" className="lp-display lp-section__title">{trust.heading}</h2>
      <ul className="lp-trust" data-testid="marketing-trust">
        {trust.items.map(([title, body], index) => {
          const Icon = TRUST_ICONS[index] ?? ShieldCheck;
          return (
            <li key={title} className="lp-trust__item">
              <span className="lp-trust__icon" aria-hidden="true"><Icon size={20} /></span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <a className="lp-link" href={href("/security")}>
        {trust.more}<ArrowRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

/** Answers reused from /pricing so the two pages can never disagree. */
export function LandingFaq() {
  const { locale, t: { faq } } = useLanding();
  const items = pricingMessages[locale].faq;
  return (
    <section className="lp-section lp-shell" id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" className="lp-display lp-section__title">{faq.heading}</h2>
      <div className="lp-faq" data-testid="marketing-faq">
        {items.map(([question, answer]) => (
          <details key={question} className="lp-faq__item">
            <summary>{question}</summary>
            <p><RichText text={answer} /></p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Final call to action before the footer. */
export function ClosingCta() {
  const { locale, t } = useLanding();
  return (
    <section className="lp-section lp-shell" aria-labelledby="closing-title">
      <div className="lp-closing" data-testid="marketing-closing-cta">
        <h2 id="closing-title" className="lp-display">{t.closing.title}</h2>
        <p>{t.closing.body}</p>
        <div className="lp-closing__actions">
          <a className="lp-btn lp-btn--emerald" href={trialRequestHref(locale)}>
            {t.nav.ctaTrial}<ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="lp-btn lp-btn--glass" href={MARKETING_LINKS.liveDemo}>{t.closing.demo}</a>
        </div>
      </div>
    </section>
  );
}
