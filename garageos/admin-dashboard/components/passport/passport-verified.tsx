import type { CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";
import { translate, type Locale } from "@/lib/i18n/dictionaries";

const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

// Public service-record header. It identifies the garage that supplied the
// records without implying an independent inspection or certification.
export function PassportVerified({ passport, locale }: { passport: Passport; locale: Locale }) {
  const { accent, soft } = ACCENT[passport.health.band];
  const style = { "--accent": accent, "--accent-soft": soft } as CSSProperties;
  const verifiedOn = new Date(passport.issued_at).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pp-verified" style={style}>
      <div className="pp-vbadge">
        {translate(locale, "passport.recorded_by", { garage: passport.garage.name })}
      </div>
      <div className="pp-vtitle">{translate(locale, "passport.record")}</div>
      <div className="pp-vmeta">
        <div>
          <div className="pp-vk">{translate(locale, "passport.prepared_by")}</div>
          <div className="pp-vv">{passport.garage.name}</div>
        </div>
        <div>
          <div className="pp-vk">{translate(locale, "passport.record_no")}</div>
          <div className="pp-vv pp-mono">{passport.code}</div>
        </div>
        <div>
          <div className="pp-vk">{translate(locale, "passport.issued")}</div>
          <div className="pp-vv">{verifiedOn}</div>
        </div>
      </div>
    </div>
  );
}
