"use client";

import { Boxes, DownloadCloud, FileClock, KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";

import { MarketingCta, useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";
import { RichText } from "@/components/marketing/pages/rich-text";
import { securityMessages } from "@/lib/marketing-pages-copy";

// Same order as `pillars` in lib/marketing-pages-copy.ts.
const PILLAR_ICONS = [Boxes, Lock, KeyRound, FileClock, RefreshCw, DownloadCloud];

export function SecurityContent() {
  const { locale } = useMarketingI18n();
  const t = securityMessages[locale];
  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><ShieldCheck size={14} /> {t.eyebrow}</span>
          <h1 className="mkt-display mkt-page-title">{t.title}</h1>
          <p className="mkt-page-sub">{t.sub}</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 40 }}>
        <div className="mkt-shell">
          <div className="mkt-trust-grid">
            {t.pillars.map(({ title, body }, index) => {
              const Icon = PILLAR_ICONS[index] ?? ShieldCheck;
              return (
                <article className="mkt-trust" key={title}>
                  <div className="mkt-trust__icon"><Icon size={20} /></div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              );
            })}
          </div>

          <div className="mkt-prose" style={{ marginTop: 72 }}>
            {t.sections.map((section) => (
              <div key={section.id}>
                <h2 id={section.id}>{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}><RichText text={paragraph} /></p>)}
              </div>
            ))}
            <div className="mkt-callout">{t.callout}</div>
          </div>
        </div>
      </section>

      <MarketingCta title={t.ctaTitle} body={t.ctaBody} />
    </>
  );
}
