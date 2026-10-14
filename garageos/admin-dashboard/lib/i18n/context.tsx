"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { makeFormatters } from "./formatters";

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

// Client provider. The initial locale is resolved server-side (from the cookie)
// and passed in, so there's no flash of the wrong language on first paint.
export function I18nProvider({
  initialLocale = "en",
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = textDirection(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof document !== "undefined") {
      // 1-year cookie so the server can pre-render the right language next visit.
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      document.documentElement.lang = l;
      document.documentElement.dir = textDirection(l);
    }
  }, []);

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
