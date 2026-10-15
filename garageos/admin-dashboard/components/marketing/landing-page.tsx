"use client";

import Image from "next/image";
import { ArrowRight, Bell, CarFront, Check, Clock3, FileText, Package, Wrench } from "lucide-react";
import { DEMO_HREF, LIVE_DEMO_HREF } from "@/components/marketing/chrome";
import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";
import { ShowroomSwitcher } from "@/components/marketing/showroom-switcher";
import { VehicleShowroom } from "@/components/marketing/vehicle-showroom";
import { EstimatePreview, PricingPreview } from "@/components/marketing/landing-interactions";

const CAPABILITY_ICONS = [CarFront, FileText, Wrench, Clock3, Bell, Package];

export function LandingPage() {
  const { locale, messages: { landing: t } } = useMarketingI18n();
  const trialHref = `${DEMO_HREF.split("?")[0]}?subject=${encodeURIComponent("GarageOS 14-day trial request")}&body=${encodeURIComponent(`Language: ${locale}`)}`;
  return (
    <main className="mkt-home" data-testid="marketing-landing" lang={locale}>
      <section className="mkt-home__hero" id="top" aria-labelledby="home-title">
        <div className="mkt-home__hero-grid mkt-shell">
          <div className="mkt-home__intro">
            <span className="mkt-home__eyebrow"><span />{t.hero.eyebrow}</span>
            <h1 id="home-title">{t.hero.title} <em>{t.hero.accent}</em></h1>
            <p className="mkt-home__lede">{t.hero.detail}</p>
            <div className="mkt-home__actions">
              <a href={LIVE_DEMO_HREF} className="mkt-home__button mkt-home__button--dark">{t.hero.demo}<ArrowRight size={17} aria-hidden="true" /></a>
              <a href={DEMO_HREF} className="mkt-home__button mkt-home__button--plain">{t.hero.contact}</a>
            </div>
            <p className="mkt-home__note">{t.hero.note}</p>
          </div>
          <VehicleShowroom />
        </div>
      </section>
      <section className="mkt-home__section" id="showroom" aria-labelledby="showroom-title">
        <div className="mkt-shell">
          <div className="mkt-home__section-heading">
            <span className="mkt-home__eyebrow"><span />{t.rolesHeading.eyebrow}</span>
            <h2 id="showroom-title">{t.rolesHeading.title}</h2>
          </div>
          <ShowroomSwitcher />
        </div>
      </section>
      <section className="mkt-home__capability-section" id="product" aria-labelledby="capability-title">
        <div className="mkt-shell">
          <div className="mkt-home__section-heading">
            <span className="mkt-home__eyebrow"><span />{t.capabilitiesHeading.eyebrow}</span>
            <h2 id="capability-title">{t.capabilitiesHeading.title}</h2>
          </div>
          <div className="mkt-home__capability-grid" data-testid="marketing-kpi-grid">
            {t.capabilities.map(({ title, label }, index) => {
              const Icon = CAPABILITY_ICONS[index];
              return (
                <article className="mkt-home__capability" key={title}>
                  <span className="mkt-home__capability-icon"><Icon size={20} aria-hidden="true" /></span>
                  <h3>{title}</h3><p>{label}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      <section className="mkt-home__workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="mkt-shell mkt-home__workflow-layout">
          <div>
            <div className="mkt-home__workflow-heading">
              <span className="mkt-home__eyebrow"><span />{t.workflowHeading.eyebrow}</span>
              <h2 id="workflow-title">{t.workflowHeading.title}</h2>
            </div>
            <ol className="mkt-home__workflow-list">
              {t.workflow.map(([title, detail], index) => (
                <li key={title} className={index === t.workflow.length - 1 ? "is-last" : undefined}>
                  <span className="mkt-home__step-number">0{index + 1}</span>
                  <span className="mkt-home__step-copy"><strong>{title}</strong><small>{detail}</small></span>
                  {index === t.workflow.length - 1 && <Check size={18} className="mkt-home__step-check" aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </div>
          <EstimatePreview />
        </div>
      </section>
      <section className="mkt-home__section" id="vehicle-passport" aria-labelledby="passport-title">
        <div className="mkt-shell mkt-home__passport">
          <div className="mkt-home__passport-copy">
            <span className="mkt-home__eyebrow"><span />{t.passport.eyebrow}</span>
            <h2 id="passport-title">{t.passport.title}</h2><p>{t.passport.detail}</p>
          </div>
          <figure className="mkt-home__passport-image">
            <Image src="/marketing/vehicle-health.png" alt={t.passport.alt} width={2880} height={1800} loading="lazy" unoptimized />
            <figcaption className="mkt-home__screenshot-note">{t.screenshot}</figcaption>
          </figure>
        </div>
      </section>
      <PricingPreview />
      <aside className="mkt-home__mobile-cta" data-testid="marketing-mobile-cta">
        <span>{t.sticky.label}</span>
        <a className="mkt-home__button mkt-home__button--dark" href={trialHref}>{t.sticky.button}<ArrowRight size={16} aria-hidden="true" /></a>
      </aside>
    </main>
  );
}
