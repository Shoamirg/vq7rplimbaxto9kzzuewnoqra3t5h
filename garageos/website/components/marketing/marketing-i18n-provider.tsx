"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { useMobileMenu } from "@/components/marketing/use-mobile-menu";
import { MARKETING_LINKS, marketingMessages, type MarketingMessages } from "@/lib/marketing-i18n";
import {
  DEFAULT_MARKETING_LOCALE, isMarketingLocale, localizedPath, MARKETING_LOCALE_COOKIE,
  MARKETING_LOCALE_STORAGE_KEY, type MarketingLocale,
} from "@/lib/marketing-locale";

type MarketingI18nContextValue = {
  locale: MarketingLocale;
  setLocale: (locale: MarketingLocale) => void;
  messages: MarketingMessages;
  /** Site-relative marketing link in the current language ("/pricing" -> "/ru/pricing"). */
  href: (path: string) => string;
};

const MarketingI18nContext = createContext<MarketingI18nContextValue | null>(null);
const ONE_YEAR = 60 * 60 * 24 * 365;

function rememberLocale(locale: MarketingLocale) {
  document.cookie = `${MARKETING_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
  try {
    window.localStorage.removeItem(MARKETING_LOCALE_STORAGE_KEY);
  } catch {
    // Storage may be blocked (private mode); the cookie is the source of truth.
  }
}

/**
 * The locale comes from the URL (resolved on the server by middleware), so the
 * first paint is already in the right language. Choosing a language remembers it
 * and loads that language's URL, which also updates <html lang> and metadata.
 */
export function MarketingI18nProvider({ initialLocale, children }: { initialLocale: MarketingLocale; children: ReactNode }) {
  const locale = initialLocale;

  const setLocale = useCallback((nextLocale: MarketingLocale) => {
    rememberLocale(nextLocale);
    if (nextLocale === locale) return;
    const { pathname, search, hash } = window.location;
    window.location.assign(`${localizedPath(nextLocale, pathname)}${search}${hash}`);
  }, [locale]);

  useEffect(() => {
    // One-time migration of the old client-only preference: honour it once,
    // after which the cookie (read by middleware) takes over.
    let legacy: string | null = null;
    try {
      legacy = window.localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY);
      window.localStorage.removeItem(MARKETING_LOCALE_STORAGE_KEY);
    } catch {
      return;
    }
    const hasCookie = document.cookie.split("; ").some((entry) => entry.startsWith(`${MARKETING_LOCALE_COOKIE}=`));
    // Only redirect from the default-language URL; an explicit /ru or /en link wins.
    if (isMarketingLocale(legacy) && !hasCookie && locale === DEFAULT_MARKETING_LOCALE && legacy !== locale) {
      setLocale(legacy);
    }
  }, [locale, setLocale]);

  const href = useCallback((path: string) => localizedPath(locale, path), [locale]);
  const value = useMemo(() => ({ locale, setLocale, messages: marketingMessages[locale], href }), [locale, setLocale, href]);
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
  const { locale, setLocale, href, messages: { nav } } = useMarketingI18n();
  const menu = useMobileMenu("(min-width: 900px)");
  const links = [
    { href: href("/#showroom"), label: nav.product },
    { href: href("/#flow"), label: nav.workflow },
    { href: href("/#passport"), label: nav.vehicleRecord },
    { href: href("/pricing"), label: nav.pricing },
    { href: href("/#faq"), label: nav.faq },
  ];
  return (
    <header className="mkt-nav">
      <div className="mkt-shell mkt-nav__row">
        <Link href={href("/")} aria-label={nav.home} className="mkt-nav__brand"><Logo theme="dark" size={24} className="mkt-nav__logo" /></Link>
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
          <button type="button" className="mkt-nav__menu" ref={menu.buttonRef} onClick={menu.toggle}
            aria-expanded={menu.open} aria-controls="mkt-menu" aria-label={menu.open ? nav.closeMenu : nav.menu}>
            {menu.open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div id="mkt-menu" className="mkt-menu" ref={menu.panelRef} hidden={!menu.open}>
        <nav aria-label={nav.primary}>
          {links.map((link) => <a key={link.href} href={link.href} onClick={menu.close}>{link.label}</a>)}
        </nav>
        <a href={MARKETING_LINKS.signIn} className="mkt-menu__signin" onClick={menu.close}>{nav.signIn}</a>
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
  const { href, messages: { footer } } = useMarketingI18n();
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
                <li><Link href={href("/#showroom")}>{footer.features}</Link></li>
                <li><a href={href("/pricing")}>{footer.pricing}</a></li>
                <li><a href={href("/security")}>{footer.security}</a></li>
                <li><a href={href("/docs")}>{footer.documentation}</a></li>
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
                <li><a href={href("/privacy")}>{footer.privacy}</a></li>
                <li><a href={href("/terms")}>{footer.terms}</a></li>
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
