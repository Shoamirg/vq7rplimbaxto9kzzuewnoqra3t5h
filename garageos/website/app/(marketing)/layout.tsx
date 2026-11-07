import type { ReactNode } from "react";

import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { MarketingI18nProvider } from "@/components/marketing/marketing-i18n-provider";
import "@/components/marketing/marketing.css";
import "@/components/marketing/landing/landing.css";
import { requestLocale } from "@/lib/marketing-meta";

// Shared shell for the public marketing site (landing, pricing, security, docs,
// legal). Provides a shared `.mkt` baseline + one nav + one footer for every page.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingI18nProvider initialLocale={await requestLocale()}>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </MarketingI18nProvider>
  );
}
