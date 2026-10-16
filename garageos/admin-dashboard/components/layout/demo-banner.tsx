"use client";

import { useEffect } from "react";
import { Eye } from "lucide-react";
import { useToast } from "@garageos/design-system";

import { useI18n } from "@/lib/i18n/context";
import { MARKETING_LINKS } from "@/lib/marketing-i18n";

// Persistent bar shown only during a read-only demo session. Also listens for the
// `garageos:demo-blocked` event (dispatched by clientFetch when the backend rejects
// a write) and explains, instead of letting the action fail silently.
export function DemoBanner() {
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    const onBlocked = () =>
      toast({ title: t("platform.demo_blocked_title"), description: t("platform.demo_blocked_body"), variant: "info" });
    window.addEventListener("garageos:demo-blocked", onBlocked);
    return () => window.removeEventListener("garageos:demo-blocked", onBlocked);
  }, [toast, t]);

  return (
    <div
      role="status"
      data-demo-banner=""
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
        padding: "8px 16px", fontSize: 13.5, fontWeight: 500,
        color: "#ffffff", background: "#0c8059",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <Eye size={15} /> {t("platform.demo_banner")}
      </span>
      <a
        href={MARKETING_LINKS.demo}
        style={{ color: "#ffffff", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        {t("platform.demo_banner_cta")}
      </a>
    </div>
  );
}
