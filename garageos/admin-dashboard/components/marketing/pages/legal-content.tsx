"use client";

import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";
import { RichText } from "@/components/marketing/pages/rich-text";
import { legalMessages, type LegalBlock, type LegalCopy } from "@/lib/marketing-legal-copy";

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "ul") {
    return <ul>{block.items.map((item) => <li key={item}><RichText text={item} /></li>)}</ul>;
  }
  return <p><RichText text={block.text} /></p>;
}

/** Shared body for /privacy and /terms. */
export function LegalContent({ document }: { document: keyof LegalCopy }) {
  const { locale } = useMarketingI18n();
  const t = legalMessages[locale][document];
  return (
    <section className="mkt-section">
      <div className="mkt-shell">
        <div className="mkt-page-head" style={{ padding: 0, textAlign: "left" }}>
          <h1 className="mkt-display mkt-page-title" style={{ margin: 0, maxWidth: "none" }}>{t.title}</h1>
        </div>
        <div className="mkt-prose" style={{ marginTop: 28 }}>
          <p className="mkt-prose__meta">{t.updated}</p>
          <div className="mkt-callout">{t.callout}</div>
          <p>{t.intro}</p>
          {t.sections.map((section) => (
            <div key={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              {section.blocks.map((block, index) => <Block key={index} block={block} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
