import type { CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";

const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

// Trust-first landing header — like checking a luxury-watch certificate. Shown
// above the document so the first impression is authenticity, not just data.
export function PassportVerified({ passport }: { passport: Passport }) {
  const { accent, soft } = ACCENT[passport.health.band];
  const style = { "--accent": accent, "--accent-soft": soft } as CSSProperties;
  const verifiedOn = new Date(passport.issued_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pp-verified" style={style}>
      <div className="pp-vbadge">
        <span className="pp-vcheck">✓</span> Verified
      </div>
      <div className="pp-vtitle">Digital Vehicle Passport</div>
      <div className="pp-vmeta">
        <div>
          <div className="pp-vk">Issued by</div>
          <div className="pp-vv">{passport.garage.name}</div>
        </div>
        <div>
          <div className="pp-vk">Passport No.</div>
          <div className="pp-vv pp-mono">{passport.code}</div>
        </div>
        <div>
          <div className="pp-vk">Verified</div>
          <div className="pp-vv">{verifiedOn}</div>
        </div>
      </div>
    </div>
  );
}
