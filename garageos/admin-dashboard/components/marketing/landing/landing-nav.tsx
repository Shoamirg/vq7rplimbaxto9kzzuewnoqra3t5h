"use client";

import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { LANDING_SECTIONS, useActiveSection, useLanding } from "@/components/marketing/landing/use-landing";
import { MARKETING_LINKS, trialRequestHref, type MarketingLocale } from "@/lib/marketing-i18n";

const LOCALES: MarketingLocale[] = ["uz", "ru", "en"];

export function LanguagePill() {
  const { locale, setLocale, t } = useLanding();
  return (
    <div className="lp-lang" role="group" aria-label={t.nav.language} data-testid="marketing-language" data-value={locale}>
      {LOCALES.map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={locale === code} onClick={() => setLocale(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Three floating pill islands: brand · section switcher · language + login + trial. */
export function LandingNav() {
  const { locale, t } = useLanding();
  const active = useActiveSection();
  return (
    <header className="lp-nav">
      <div className="lp-nav__row">
        <Link href="/" aria-label={t.nav.home} className="lp-island lp-nav__brand">
          <Logo theme="light" size={20} className="lp-nav__logo" />
        </Link>
        <nav className="lp-island lp-nav__sections" aria-label={t.nav.sections}>
          {LANDING_SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined}>{t.nav[id]}</a>
          ))}
        </nav>
        <div className="lp-nav__end">
          <LanguagePill />
          <a href={MARKETING_LINKS.signIn} className="lp-nav__login" aria-label={t.nav.login} title={t.nav.login}>
            <LogIn size={18} aria-hidden="true" />
          </a>
          <a href={trialRequestHref(locale)} className="lp-btn lp-btn--obsidian lp-nav__trial">
            {t.nav.ctaTrial}<ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}
