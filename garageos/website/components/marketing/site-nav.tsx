"use client";

import { usePathname } from "next/navigation";

import { LandingNav } from "@/components/marketing/landing/landing-nav";
import { ContentNav } from "@/components/marketing/marketing-i18n-provider";
import { splitLocalePath } from "@/lib/marketing-locale";

// The landing page (/, /ru, /en) uses floating pill islands; content pages keep the dark bar.
export function MarketingNav() {
  return splitLocalePath(usePathname()).path === "/" ? <LandingNav /> : <ContentNav />;
}
