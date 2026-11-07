"use client";

import { Smartphone } from "lucide-react";

import { CarBlueprint, RadialGauge } from "@/components/marketing/landing/car-blueprint";
import { useLanding } from "@/components/marketing/landing/use-landing";

/** Section 4: drafting-grid vehicle passport with gauges, plate badge and a mobile app note. */
export function PassportStrip() {
  const { t: { telemetry: t } } = useLanding();
  return (
    <section className="lp-section lp-shell" id="passport" aria-labelledby="passport-title">
      <div className="lp-passport">
        <div className="lp-passport__copy">
          <span className="lp-kicker">{t.kicker}</span>
          <h2 id="passport-title" className="lp-display">{t.title}</h2>
          <span className="lp-plate lp-plate--large" aria-label="01 A 123 BC"><span>01</span>A 123 BC</span>
        </div>
        <CarBlueprint label={t.diagram} />
        <div className="lp-passport__gauges">
          <RadialGauge value={95} display="95%" label={t.gauge1} />
          <RadialGauge value={36} display={t.km} label={t.gauge2} tone="obsidian" />
        </div>
        <p className="lp-app-note">
          <span className="lp-app-note__icon"><Smartphone size={22} aria-hidden="true" /></span>
          <small>{t.appLabel}</small>
        </p>
      </div>
    </section>
  );
}
