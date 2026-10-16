"use client";

import { MarketingCta, useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";
import { RichText } from "@/components/marketing/pages/rich-text";
import { docsMessages } from "@/lib/marketing-pages-copy";

export function DocsContent() {
  const { locale } = useMarketingI18n();
  const t = docsMessages[locale];
  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> {t.eyebrow}</span>
          <h1 className="mkt-display mkt-page-title">{t.title}</h1>
          <p className="mkt-page-sub">{t.sub}</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-shell">
          <div className="mkt-docs">
            <nav className="mkt-docs__toc" aria-label={t.tocLabel}>
              <h4>{t.tocTitle}</h4>
              <ul>
                {t.sections.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
                ))}
              </ul>
            </nav>
            <div className="mkt-prose" style={{ margin: 0 }}>
              {t.sections.map((s) => (
                <div key={s.id}>
                  <h2 id={s.id}>{s.title}</h2>
                  {s.paragraphs.map((paragraph) => <p key={paragraph}><RichText text={paragraph} /></p>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MarketingCta title={t.ctaTitle} body={t.ctaBody} />
    </>
  );
}
