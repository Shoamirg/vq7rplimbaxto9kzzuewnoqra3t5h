"use client";

import { HeroShowroom } from "@/components/marketing/landing/hero-showroom";
import { JobFlow } from "@/components/marketing/landing/job-flow";
import { PassportStrip } from "@/components/marketing/landing/passport-strip";
import { PricingBento } from "@/components/marketing/landing/pricing-bento";
import { RoleSwitcher } from "@/components/marketing/landing/role-switcher";
import { useLanding } from "@/components/marketing/landing/use-landing";
import { trialRequestHref } from "@/lib/marketing-i18n";

export function LandingPage({ qrSvg }: { qrSvg: string }) {
  const { locale, t } = useLanding();
  return (
    <main className="lp" data-testid="marketing-landing" lang={locale}>
      <HeroShowroom />
      <RoleSwitcher />
      <JobFlow />
      <PassportStrip qrSvg={qrSvg} />
      <PricingBento />
      <aside className="lp-sticky" data-testid="marketing-mobile-cta">
        <span>{t.sticky.label}</span>
        <a className="lp-btn lp-btn--emerald" href={trialRequestHref(locale)}>{t.sticky.button}</a>
      </aside>
    </main>
  );
}
