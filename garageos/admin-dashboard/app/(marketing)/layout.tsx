import type { ReactNode } from "react";

import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import "@/components/marketing/marketing.css";

// Shared shell for the public marketing site (landing, pricing, security, docs,
// legal). Provides a shared `.mkt` baseline + one nav + one footer for every page.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mkt">
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
