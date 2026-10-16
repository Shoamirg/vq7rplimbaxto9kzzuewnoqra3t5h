"use client";

import { usePathname } from "next/navigation";

import { LandingNav } from "@/components/marketing/landing/landing-nav";
import { ContentNav } from "@/components/marketing/marketing-i18n-provider";

// The landing page uses floating pill islands; content pages keep the dark bar.
export function MarketingNav() {
  return usePathname() === "/" ? <LandingNav /> : <ContentNav />;
}
