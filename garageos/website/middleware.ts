import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_MARKETING_LOCALE, isMarketingLocale, localizedPath, MARKETING_LOCALE_COOKIE,
  MARKETING_LOCALE_HEADER, splitLocalePath,
} from "@/lib/marketing-locale";

// Maps locale URLs onto the single set of pages:
//   /ru/pricing  -> rendered by /pricing with locale "ru" (rewrite, URL unchanged)
//   /pricing     -> Uzbek, unless the visitor explicitly chose RU/EN earlier
//                   (cookie), in which case they are redirected to their language.
//   /uz/pricing  -> 308 to /pricing (one canonical URL for Uzbek)
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (/^\/uz(?=\/|$)/.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/uz/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  const { locale, prefixed, path } = splitLocalePath(pathname);
  if (!prefixed) {
    const preferred = request.cookies.get(MARKETING_LOCALE_COOKIE)?.value;
    if (isMarketingLocale(preferred) && preferred !== DEFAULT_MARKETING_LOCALE) {
      const url = request.nextUrl.clone();
      url.pathname = localizedPath(preferred, pathname);
      url.search = search;
      return NextResponse.redirect(url, 307);
    }
  }

  const headers = new Headers(request.headers);
  headers.set(MARKETING_LOCALE_HEADER, locale);
  if (!prefixed) return NextResponse.next({ request: { headers } });

  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Pages only: skip Next internals, API routes and files with an extension
  // (images, icons, robots.txt, sitemap.xml ...).
  matcher: ["/((?!_next/|api/|.*\\.[\\w]+$).*)"],
};
