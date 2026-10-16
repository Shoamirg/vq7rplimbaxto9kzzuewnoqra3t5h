'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Check, Eye } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { DemoEntryButton } from '@/components/auth/demo-entry-button';
import { isLocale, LOCALE_COOKIE, LOCALES } from '@/lib/i18n/dictionaries';
import { useI18n } from '@/lib/i18n/context';
import { MARKETING_LOCALE_STORAGE_KEY } from '@/lib/marketing-i18n';

const HIGHLIGHTS = [
  'platform.demo_highlight_operations',
  'platform.demo_highlight_intelligence',
  'platform.demo_highlight_customers',
  'platform.demo_highlight_telegram',
];

function hasLocaleCookie() {
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`));
}

/** /demo body. Uses the app i18n (cookie-backed) so the page, the entry button
 *  and the demo dashboard behind it all speak the same language. */
export function DemoEntryContent() {
  const { locale, setLocale, t } = useI18n();

  // A visitor who picked a language on the public site, but never in the app,
  // keeps that language here (and in the demo dashboard via the app cookie).
  useEffect(() => {
    if (hasLocaleCookie()) return;
    try {
      const saved = window.localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY);
      if (isLocale(saved) && saved !== locale) setLocale(saved);
    } catch {
      // Storage can be blocked (private mode); the default language still works.
    }
    // Run once on mount; later changes come from the select below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseLocale(value: string) {
    if (!isLocale(value)) return;
    setLocale(value);
    try { window.localStorage.setItem(MARKETING_LOCALE_STORAGE_KEY, value); } catch { /* storage blocked */ }
  }

  return (
    <div className="mkt" lang={locale} style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
      <div className="mkt-hero__glow" aria-hidden style={{ height: 520 }} />
      <select className="mkt-language" aria-label={t('menu.language')} data-testid="demo-language" value={locale}
        onChange={(event) => chooseLocale(event.target.value)}
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}>
        {LOCALES.map((code) => <option key={code} value={code} lang={code}>{code.toUpperCase()}</option>)}
      </select>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <Logo theme="dark" size={26} />
        </div>
        <span className="mkt-eyebrow"><Eye size={14} /> {t('platform.demo_eyebrow')}</span>
        <h1 className="mkt-display" style={{ fontSize: 'clamp(30px,5vw,46px)', margin: '20px 0 0' }}>
          {t('platform.demo_heading')}
        </h1>
        <p className="mkt-hero__sub" style={{ margin: '16px auto 0' }}>{t('platform.demo_intro')}</p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '28px auto 0', display: 'grid', gap: 12, maxWidth: 340, textAlign: 'left' }}>
          {HIGHLIGHTS.map((key) => (
            <li key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#d3d9d6', fontSize: 15 }}>
              <Check size={17} style={{ color: 'var(--mkt-gold)', flex: 'none' }} /> {t(key)}
            </li>
          ))}
        </ul>

        <div className="mkt-hero__cta" style={{ marginTop: 32 }}>
          <DemoEntryButton />
        </div>
        <p className="mkt-hero__trust" style={{ marginTop: 18 }}>
          {t('platform.demo_footnote')}{' '}
          <Link href="/" style={{ color: 'var(--mkt-muted)', textDecoration: 'underline' }}>{t('platform.demo_back')}</Link>
        </p>
      </div>
    </div>
  );
}
