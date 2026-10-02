"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatDate, formatMoney, formatNumber } from "./format";
import {
  LOCALE_COOKIE,
  type Locale,
  type TParams,
  textDirection,
  translate,
  translatePlural,
} from "./dictionaries";

type I18nValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
  /** Translate a key, with optional `{param}` interpolation. */
  t: (key: string, params?: TParams) => string;
  /** Plural-aware translate: picks the right form for `count` per locale. */
  tp: (key: string, count: number, params?: TParams) => string;
  /** Locale-aware formatters (dates, money, numbers). */
  fmt: {
    date: (iso?: string | null, opts?: Intl.DateTimeFormatOptions) => string;
    money: (n: number, currency?: string) => string;
    number: (n: number) => string;
  };
};

const I18nContext = createContext<I18nValue | null>(null);

function makeFormatters(locale: Locale) {
  return {
    date: (iso?: string | null, opts?: Intl.DateTimeFormatOptions) => (iso ? formatDate(locale, iso, opts) : ""),
    money: (n: number, currency = "USD") => formatMoney(locale, n, currency),
    number: (n: number) => formatNumber(locale, n),
  };
}

// Client provider. The initial locale is resolved server-side (from the cookie)
// and passed in, so there's no flash of the wrong language on first paint.
export function I18nProvider({
  initialLocale = "en",
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [isSwitching, startSwitch] = useTransition();
  // Ref keeps setLocale's identity stable (consumers list it in effect deps).
  const localeRef = useRef(locale);

  const setLocale = useCallback(
    (l: Locale) => {
      if (l === localeRef.current) return;
      localeRef.current = l;
      setLocaleState(l);
      if (typeof document === "undefined") return;
      // 1-year cookie so the server can pre-render the right language next visit.
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Client components re-render instantly from state; Server Components
      // (e.g. the vehicles page) only re-translate on a fresh server render.
      // Refresh in a transition so the old UI stays put until the new one lands.
      startSwitch(() => router.refresh());
    },
    [router],
  );

  // The root layout hardcodes <html lang="en"> (it stays static); keep lang/dir
  // in sync with the active locale on first paint and on every switch.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = textDirection(locale);
  }, [locale]);

  // Dim <main> while server sections catch up so the swap reads as one fade,
  // not a half-translated page (see globals.css `[data-locale-switching]`).
  useEffect(() => {
    document.documentElement.toggleAttribute("data-locale-switching", isSwitching);
  }, [isSwitching]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: textDirection(locale),
      setLocale,
      t: (key: string, params?: TParams) => translate(locale, key, params),
      tp: (key: string, count: number, params?: TParams) => translatePlural(locale, key, count, params),
      fmt: makeFormatters(locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback so a component rendered outside the provider still works.
    return {
      locale: "en",
      dir: "ltr",
      setLocale: () => {},
      t: (key: string, params?: TParams) => translate("en", key, params),
      tp: (key: string, count: number, params?: TParams) => translatePlural("en", key, count, params),
      fmt: makeFormatters("en"),
    };
  }
  return ctx;
}
