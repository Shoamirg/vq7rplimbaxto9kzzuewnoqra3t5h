"use client";

import { useState } from "react";
import { BellRing, Camera, CheckCheck, QrCode } from "lucide-react";

import { useLanding } from "@/components/marketing/landing/use-landing";

const STEP_ICONS = [QrCode, Camera, CheckCheck, BellRing];

/** Section 3: a clickable four-step status bar instead of a "how it works" paragraph. */
export function JobFlow() {
  const { t: { flow: t } } = useLanding();
  const [step, setStep] = useState(0);
  const current = t.steps[step];
  const Icon = STEP_ICONS[step];
  return (
    <section className="lp-section lp-shell" id="flow" aria-labelledby="flow-title">
      <h2 id="flow-title" className="lp-display lp-section__title">{t.heading}</h2>
      <div className="lp-flow">
        <ol className="lp-scroller lp-flow__steps" aria-label={t.label}>
          {t.steps.map(({ state }, index) => (
            <li key={state}>
              <button type="button" aria-pressed={step === index} data-done={index < step}
                aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}>
                <span className="lp-flow__num">0{index + 1}</span>{state}
              </button>
            </li>
          ))}
        </ol>
        <div className="lp-flow__progress" aria-hidden="true"><span style={{ transform: `scaleX(${(step + 1) / t.steps.length})` }} /></div>
        <div className="lp-flow__stage" aria-live="polite">
          <article key={step} className="lp-flow__card">
            <span className="lp-flow__icon"><Icon size={26} aria-hidden="true" /></span>
            <div>
              <strong>{current.title}</strong>
              <small>{current.caption}</small>
            </div>
            <span className="lp-plate lp-plate--small"><span>01</span>A 123 BC</span>
          </article>
          <button type="button" className="lp-btn lp-btn--obsidian" onClick={() => setStep((step + 1) % t.steps.length)}>
            {step === t.steps.length - 1 ? "↺" : `0${step + 2} →`}
            <span className="lp-sr">{t.steps[(step + 1) % t.steps.length].state}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
