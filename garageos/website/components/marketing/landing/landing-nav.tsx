"use client";

import Link from "next/link";
import { ArrowRight, LogIn, Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { LANDING_SECTIONS, useActiveSection, useLanding } from "@/components/marketing/landing/use-landing";
import { useMobileMenu } from "@/components/marketing/use-mobile-menu";
import { MARKETING_LINKS, trialRequestHref } from "@/lib/marketing-i18n";
import { MARKETING_LOCALES } from "@/lib/marketing-locale";

export function LanguagePill() {
  const { locale, setLocale, t } = useLanding();
  return (
    <div className="lp-lang" role="group" aria-label={t.nav.language} data-testid="marketing-language" data-value={locale}>
      {MARKETING_LOCALES.map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={locale === code} onClick={() => setLocale(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * Floating pill islands: brand · section switcher · language + login + trial.
 * Below 1024px the section switcher, login and trial collapse into a menu panel.
 */
export function LandingNav() {
  const { locale, href, t } = useLanding();
  const active = useActiveSection();
  const menu = useMobileMenu("(min-width: 1024px)");
  return (
    <header className="lp-nav">
      <div className="lp-nav__row">
        <Link href={href("/")} aria-label={t.nav.home} className="lp-island lp-nav__brand">
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
          <button type="button" className="lp-nav__menu" ref={menu.buttonRef} onClick={menu.toggle}
            aria-expanded={menu.open} aria-controls="lp-menu" aria-label={menu.open ? t.nav.closeMenu : t.nav.menu}
            data-testid="marketing-menu-toggle">
            {menu.open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div id="lp-menu" className="lp-menu" ref={menu.panelRef} hidden={!menu.open} data-testid="marketing-menu">
        <nav aria-label={t.nav.sections}>
          {LANDING_SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} onClick={menu.close} aria-current={active === id ? "true" : undefined}>{t.nav[id]}</a>
          ))}
        </nav>
        <div className="lp-menu__actions">
          <a href={MARKETING_LINKS.signIn} className="lp-btn lp-btn--ghost lp-btn--block" onClick={menu.close}>
            <LogIn size={17} aria-hidden="true" />{t.nav.login}
          </a>
          <a href={trialRequestHref(locale)} className="lp-btn lp-btn--obsidian lp-btn--block" onClick={menu.close}>
            {t.nav.ctaTrial}<ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}
