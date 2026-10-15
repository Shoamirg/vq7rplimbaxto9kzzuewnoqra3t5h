"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import {
  isMarketingLocale, MARKETING_LINKS, MARKETING_LOCALE_STORAGE_KEY, marketingMessages,
  type MarketingLocale, type MarketingMessages,
} from "@/lib/marketing-i18n";

type MarketingI18nContextValue = {
  locale: MarketingLocale;
  setLocale: (locale: MarketingLocale) => void;
  messages: MarketingMessages;
};

const MarketingI18nContext = createContext<MarketingI18nContextValue | null>(null);

export function MarketingI18nProvider({ children }: { children: ReactNode }) {
  // Match the server's initial render; read browser storage after hydration.
  const [locale, updateLocale] = useState<MarketingLocale>("uz");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY);
      if (isMarketingLocale(saved)) updateLocale(saved);
    } catch {
      // Translation remains usable when private browsing blocks persistence.
    }
    const synchronizeLocale = (event: StorageEvent) => {
      if (event.key === MARKETING_LOCALE_STORAGE_KEY && isMarketingLocale(event.newValue)) {
        updateLocale(event.newValue);
      }
    };
    window.addEventListener("storage", synchronizeLocale);
    return () => window.removeEventListener("storage", synchronizeLocale);
  }, []);

  const setLocale = useCallback((nextLocale: MarketingLocale) => {
    updateLocale(nextLocale);
    try {
      window.localStorage.setItem(MARKETING_LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // Keep the selected language for this visit even without storage.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale, messages: marketingMessages[locale] }), [locale, setLocale]);
  return (
    <MarketingI18nContext.Provider value={value}>
      <div className="mkt" lang={locale}>{children}</div>
    </MarketingI18nContext.Provider>
  );
}

export function useMarketingI18n() {
  const context = useContext(MarketingI18nContext);
  if (!context) throw new Error("useMarketingI18n requires MarketingI18nProvider");
  return context;
}

/** Navigation for the dark content pages (pricing, security, docs, legal). */
export function ContentNav() {
  const { locale, setLocale, messages: { nav } } = useMarketingI18n();
  const links = [
    { href: "/#showroom", label: nav.product },
    { href: "/#flow", label: nav.workflow },
    { href: "/#passport", label: nav.vehicleRecord },
    { href: "/#pricing", label: nav.pricing },
  ];
  return (
    <header className="mkt-nav">
      <div className="mkt-shell mkt-nav__row">
        <Link href="/" aria-label={nav.home} className="mkt-nav__brand"><Logo theme="dark" size={24} className="mkt-nav__logo" /></Link>
        <nav className="mkt-nav__links" aria-label={nav.primary}>
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="mkt-nav__cta">
          <select className="mkt-language" aria-label={nav.language} data-testid="marketing-language" value={locale}
            onChange={(event) => { if (isMarketingLocale(event.target.value)) setLocale(event.target.value); }}>
            <option value="uz" lang="uz">UZ</option>
            <option value="ru" lang="ru">RU</option>
            <option value="en" lang="en">EN</option>
          </select>
          <a href={MARKETING_LINKS.signIn} className="mkt-nav__signin">{nav.signIn}</a>
          <a href={MARKETING_LINKS.demo} className="mkt-btn mkt-btn--primary" aria-label={nav.bookDemo}>
            <span className="mkt-nav__cta-label">{nav.bookDemo}</span>
            <span className="mkt-nav__cta-label--compact" aria-hidden="true">{nav.demo}</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export function MarketingCta({ title, body }: { title?: string; body?: string }) {
  const { locale, messages: { cta } } = useMarketingI18n();
  return (
    <section className="mkt-section mkt-cta--slim" lang={locale}>
      <div className="mkt-shell">
        <div className="mkt-cta">
          <h2 className="mkt-display">{title ?? cta.title}</h2>
          <p>{body ?? cta.body}</p>
          <div className="mkt-hero__cta" style={{ marginTop: 28 }}>
            <a href={MARKETING_LINKS.liveDemo} className="mkt-btn mkt-btn--primary mkt-btn--lg">{cta.explore} <ArrowRight size={17} aria-hidden="true" /></a>
            <a href={MARKETING_LINKS.demo} className="mkt-btn mkt-btn--ghost mkt-btn--lg">{cta.bookDemo}</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingFooter() {
  const { messages: { footer } } = useMarketingI18n();
  return (
    <footer className="mkt-footer">
      <div className="mkt-shell">
        <div className="mkt-footer__grid">
          <div className="mkt-footer__brandcol">
            <Logo theme="dark" size={22} />
            <p>{footer.description}</p>
          </div>
          <div className="mkt-footer__cols">
            <div>
              <h4>{footer.product}</h4>
              <ul>
                <li><Link href="/#showroom">{footer.features}</Link></li>
                <li><a href="/pricing">{footer.pricing}</a></li>
                <li><a href="/security">{footer.security}</a></li>
                <li><a href="/docs">{footer.documentation}</a></li>
                <li><a href={MARKETING_LINKS.liveDemo}>{footer.liveDemo}</a></li>
              </ul>
            </div>
            <div>
              <h4>{footer.company}</h4>
              <ul>
                <li><a href={MARKETING_LINKS.demo}>{footer.bookDemo}</a></li>
                <li><a href={MARKETING_LINKS.demo}>{footer.contact}</a></li>
                <li><a href={MARKETING_LINKS.signIn}>{footer.signIn}</a></li>
              </ul>
            </div>
            <div>
              <h4>{footer.legal}</h4>
              <ul>
                <li><a href="/privacy">{footer.privacy}</a></li>
                <li><a href="/terms">{footer.terms}</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mkt-footer__bottom">
          <span>© 2026 GarageOS. {footer.rights}</span>
          <span>{footer.tagline}</span>
        </div>
      </div>
    </footer>
  );
}
