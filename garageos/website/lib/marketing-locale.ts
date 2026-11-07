// Locale routing for the public site. Uzbek is the default and lives at the bare
// path ("/pricing"); Russian and English get a path prefix ("/ru/pricing",
// "/en/pricing") so every language has its own crawlable, shareable URL.
//
// This module is imported by middleware (edge runtime), server components and
// client components, so it must stay dependency-free.

export const MARKETING_LOCALES = ["uz", "ru", "en"] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];
export const DEFAULT_MARKETING_LOCALE: MarketingLocale = "uz";

/** Request header the middleware sets so server components know the URL's locale. */
export const MARKETING_LOCALE_HEADER = "x-garageos-locale";
/** Cookie that remembers a visitor's explicit language choice. */
export const MARKETING_LOCALE_COOKIE = "garageos_locale";
/** Legacy client-only preference (before locale URLs); read once and migrated to the cookie. */
export const MARKETING_LOCALE_STORAGE_KEY = "garageos-marketing-locale";

/** BCP-47 tags for <html lang>, hreflang and Open Graph. */
export const MARKETING_LOCALE_TAGS: Record<MarketingLocale, { lang: string; og: string }> = {
  uz: { lang: "uz", og: "uz_UZ" },
  ru: { lang: "ru", og: "ru_RU" },
  en: { lang: "en", og: "en_US" },
};

export const SITE_URL = (process.env.SITE_URL || "https://garageos.uz").replace(/\/$/, "");

export function isMarketingLocale(value: unknown): value is MarketingLocale {
  return typeof value === "string" && (MARKETING_LOCALES as readonly string[]).includes(value);
}

/** Split "/ru/pricing" into { locale: "ru", path: "/pricing" }. Unprefixed paths are Uzbek. */
export function splitLocalePath(pathname: string): { locale: MarketingLocale; prefixed: boolean; path: string } {
  const match = /^\/(ru|en)(?=\/|$)(.*)$/.exec(pathname);
  if (!match) return { locale: DEFAULT_MARKETING_LOCALE, prefixed: false, path: pathname || "/" };
  return { locale: match[1] as MarketingLocale, prefixed: true, path: match[2] || "/" };
}

/**
 * Site-relative marketing path for a locale: ("ru", "/#pricing") -> "/ru#pricing",
 * ("ru", "/pricing") -> "/ru/pricing", ("uz", "/pricing") -> "/pricing".
 * Absolute URLs, mailto: links and app routes (/login, /demo) pass through untouched.
 */
export function localizedPath(locale: MarketingLocale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || isAppRoute(href)) return href;
  const hashIndex = href.search(/[?#]/);
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const suffix = hashIndex === -1 ? "" : href.slice(hashIndex);
  const bare = splitLocalePath(path).path;
  if (locale === DEFAULT_MARKETING_LOCALE) return `${bare}${suffix}`;
  return `/${locale}${bare === "/" ? "" : bare}${suffix}`;
}

/** Routes served by the GarageOS app (redirected away by next.config.js), never localized. */
function isAppRoute(href: string) {
  return /^\/(login|demo)(?=[/?#]|$)/.test(href);
}
