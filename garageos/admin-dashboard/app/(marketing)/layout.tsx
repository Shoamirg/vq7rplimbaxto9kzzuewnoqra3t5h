import type { ReactNode } from "react";

import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { MarketingI18nProvider } from "@/components/marketing/marketing-i18n-provider";
import "@/components/marketing/marketing.css";
import "@/components/marketing/landing/landing.css";

// Shared shell for the public marketing site (landing, pricing, security, docs,
// legal). Provides a shared `.mkt` baseline + one nav + one footer for every page.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingI18nProvider>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </MarketingI18nProvider>
  );
}
