"use client";

import { useEffect, useState } from "react";

import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

export const LANDING_SECTIONS = ["showroom", "roles", "passport", "pricing"] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

/** Landing copy for the active locale. */
export function useLanding() {
  const { locale, setLocale, messages } = useMarketingI18n();
  return { locale, setLocale, t: messages.landing };
}

/** The section currently crossing the upper third of the viewport (drives the nav highlight). */
export function useActiveSection() {
  const [active, setActive] = useState<LandingSection>("showroom");
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      const id = visible[0]?.target.id;
      if (LANDING_SECTIONS.includes(id as LandingSection)) setActive(id as LandingSection);
    }, { rootMargin: "-30% 0px -60% 0px" });
    LANDING_SECTIONS.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);
  return active;
}
