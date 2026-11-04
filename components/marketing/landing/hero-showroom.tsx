"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight, Bot, CalendarClock, Camera, CheckCheck, CircleDot, CreditCard, Droplets, FileCheck2,
  Sparkles, Wrench,
} from "lucide-react";

import { useLanding } from "@/components/marketing/landing/use-landing";
import { MARKETING_LINKS } from "@/lib/marketing-i18n";

const SHOP_ICONS = { repair: Wrench, detailing: Sparkles, wash: Droplets, tire: CircleDot } as const;
const TILE_ICONS = [CalendarClock, FileCheck2, Camera, CreditCard];
// Pin positions are percentages of the cropped stage photo (sonata-stage.jpg).
const HOTSPOT_POSITIONS: Record<string, { left: string; top: string }> = {
  brakes: { left: "56%", top: "71%" },
  engine: { left: "77%", top: "33%" },
  tires: { left: "29%", top: "60%" },
};

export function HeroShowroom() {
  const { t } = useLanding();
  const [shopIndex, setShopIndex] = useState(0);
  const shop = t.shops[shopIndex];
  return (
    <section className="lp-hero lp-shell" id="showroom" aria-labelledby="home-title">
      <div className="lp-hero__main">
        <span className="lp-pill lp-pill--status"><span className="lp-dot" aria-hidden="true" />{t.hero.badge}</span>
        <h1 id="home-title" className="lp-display">{t.hero.title}</h1>
        <p className="lp-hero__subtitle">{t.hero.subtitle}</p>
        <div className="lp-scroller lp-shops" role="group" aria-label={t.hero.shopLabel} data-testid="marketing-shop-carousel">
          {t.shops.map(({ id, label }, index) => {
            const Icon = SHOP_ICONS[id as keyof typeof SHOP_ICONS];
            return (
              <button key={id} type="button" className="lp-chip" aria-pressed={shopIndex === index}
                data-testid={`shop-type-${id}`} onClick={() => setShopIndex(index)}>
                <Icon size={16} aria-hidden="true" />{label}
              </button>
            );
          })}
        </div>
        <VehicleStage />
        <dl className="lp-kpis" data-testid="marketing-kpi-grid" aria-live="polite">
          {t.kpiLabels.map((label, index) => (
            <div className="lp-kpi" key={label}>
              <dt>{label}</dt>
              <dd key={`${shop.id}-${index}`} className="lp-kpi__value">{shop.kpis[index]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <AssistantCard live={shop.live} liveKey={shop.id} />
    </section>
  );
}

function VehicleStage() {
  const { t } = useLanding();
  const [pin, setPin] = useState<string | null>("brakes");
  const finding = t.hotspots.find((spot) => spot.id === pin);
  return (
    <figure className="lp-stage">
      <div className="lp-stage__head">
        <span className="lp-plate" aria-label="01 A 123 BC"><span>01</span>A 123 BC</span>
        <span className="lp-pill lp-pill--soft">{t.hero.inspect}</span>
      </div>
      <div className="lp-stage__photo">
        <Image src="/marketing/sonata-stage.jpg" alt={t.hero.alt} width={1500} height={640}
          className="lp-stage__car" data-testid="hero-vehicle-photo" priority unoptimized />
        {t.hotspots.map(({ id, label }) => (
          <button key={id} type="button" className="lp-hotspot" style={HOTSPOT_POSITIONS[id]}
            aria-pressed={pin === id} aria-label={label} onClick={() => setPin(pin === id ? null : id)}>
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      {finding && (
        <p className="lp-stage__finding" role="status">
          <strong>{finding.label}</strong>{finding.finding}
        </p>
      )}
      <figcaption className="lp-credit">
        {t.hero.photoCredit}{" "}
        <a href="https://unsplash.com/photos/a-white-car-on-a-white-background-oa68pmfG-qk" target="_blank" rel="noopener noreferrer">
          Hyundai Motor Group / Unsplash
        </a>
      </figcaption>
    </figure>
  );
}

function AssistantCard({ live, liveKey }: { live: string; liveKey: string }) {
  const { t } = useLanding();
  const [plate, message] = splitPlate(live);
  return (
    <aside className="lp-assistant" aria-labelledby="assistant-title">
      <div className="lp-assistant__head">
        <span className="lp-assistant__icon"><Bot size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="assistant-title">{t.assistant.title}</h2>
          <p>{t.assistant.subtitle}</p>
        </div>
      </div>
      <ul className="lp-tiles">
        {t.assistant.tiles.map(([title, sub], index) => {
          const Icon = TILE_ICONS[index];
          return (
            <li key={title} className="lp-tile">
              <Icon size={18} aria-hidden="true" />
              <strong>{title}</strong>
              <small>{sub}</small>
            </li>
          );
        })}
      </ul>
      <div className="lp-telegram" data-testid="shop-preview" aria-live="polite" aria-atomic="true">
        <span className="lp-telegram__label"><span className="lp-dot" aria-hidden="true" />{t.assistant.live}</span>
        <p key={liveKey} className="lp-telegram__bubble">
          <strong>{plate}</strong>{message}
          <CheckCheck size={14} className="lp-telegram__ticks" aria-hidden="true" />
        </p>
      </div>
      <a href={MARKETING_LINKS.liveDemo} className="lp-btn lp-btn--emerald lp-btn--block">
        {t.assistant.send}<ArrowRight size={16} aria-hidden="true" />
      </a>
    </aside>
  );
}

function splitPlate(text: string): [string, string] {
  const at = text.indexOf(":");
  return at > 0 ? [text.slice(0, at), text.slice(at + 1).trim()] : ["", text];
}
