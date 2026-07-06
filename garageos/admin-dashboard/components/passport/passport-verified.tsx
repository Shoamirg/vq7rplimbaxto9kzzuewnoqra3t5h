"use client";

import type { CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

// Trust-first landing header — like checking a luxury-watch certificate. Shown
// above the document so the first impression is authenticity, not just data.
export function PassportVerified({ passport }: { passport: Passport }) {
  const { t } = useI18n();
  const { accent, soft } = ACCENT[passport.health.band];
  const style = { "--accent": accent, "--accent-soft": soft } as CSSProperties;
  const verifiedOn = new Date(passport.issued_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pp-verified" style={style}>
      <div className="pp-vbadge">
        <span className="pp-vcheck">✓</span> {t("pass.verified")}
      </div>
      <div className="pp-vtitle">{t("pass.digital_passport")}</div>
      <div className="pp-vmeta">
        <div>
          <div className="pp-vk">{t("pass.issued_by")}</div>
          <div className="pp-vv">{passport.garage.name}</div>
        </div>
        <div>
          <div className="pp-vk">{t("pass.passport_no")}</div>
          <div className="pp-vv pp-mono">{passport.code}</div>
        </div>
        <div>
          <div className="pp-vk">{t("pass.verified")}</div>
          <div className="pp-vv">{verifiedOn}</div>
        </div>
      </div>
    </div>
  );
}
