"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, CalendarDays, CarFront, Check, CircleDot, ClipboardList, FileText, Gauge, History, Sparkles, Users } from "lucide-react";
import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

const SHOP_TYPES = [
  { id: "general", icon: CarFront },
  { id: "tires", icon: CircleDot },
  { id: "detailing", icon: Sparkles },
];
const META_ICONS = [Users, ClipboardList, History, CalendarDays];

export function VehicleShowroom() {
  const { messages: { landing: t } } = useMarketingI18n();
  const [active, setActive] = useState(0);
  const actions = [
    { href: "#workflow", icon: ClipboardList, label: t.proof[1] },
    { href: "#estimate-preview", icon: FileText, label: t.proof[2] },
    { href: "#vehicle-passport", icon: History, label: t.vehicle.history },
    { href: "#product", icon: CalendarDays, label: t.proof[3] },
  ];
  return (
    <div className="mkt-home__shop-preview">
      <div className="mkt-home__shop-types" role="group" aria-label={t.hero.shopLabel} data-testid="marketing-shop-carousel">
        {SHOP_TYPES.map(({ id, icon: Icon }, index) => (
          <button key={id} type="button" aria-pressed={active === index} data-testid={`shop-type-${id}`} onClick={() => setActive(index)}>
            <Icon size={16} aria-hidden="true" />{t.shops[index].label}
          </button>
        ))}
      </div>
      <div className="mkt-home__workstation">
        <figure className="mkt-home__vehicle-scene">
          <div className="mkt-home__scene-heading"><span>Hyundai SONATA</span><span className="mkt-home__sample"><span />{t.vehicle.sample}</span></div>
          <div className="mkt-home__photo-frame">
            <Image src="/marketing/sonata-studio.jpg" alt={t.vehicle.alt} width={2400} height={2400}
              className="mkt-home__vehicle-photo" data-testid="hero-vehicle-photo" sizes="(max-width: 767px) 175vw, (max-width: 1100px) 140vw, 1500px" priority />
          </div>
          <figcaption className="mkt-home__photo-credit">
            {t.vehicle.photoCredit} <a href="https://unsplash.com/photos/a-white-car-on-a-white-background-oa68pmfG-qk" target="_blank" rel="noopener noreferrer">Hyundai Motor Group / Unsplash<ArrowRight size={11} aria-hidden="true" /></a>
          </figcaption>
        </figure>
        <aside className="mkt-home__service-console" aria-label={t.vehicle.console}>
          <div className="mkt-home__console-heading"><h2>{t.vehicle.console}</h2><span><Gauge size={21} aria-hidden="true" /></span></div>
          <div className="mkt-home__console-actions">
            {actions.map(({ href, icon: Icon, label }) => <a href={href} key={label}><Icon size={21} aria-hidden="true" /><span>{label}</span></a>)}
          </div>
          <div className="mkt-home__service-job" data-testid="shop-preview" aria-live="polite" aria-atomic="true">
            <span className="mkt-home__job-icon"><Check size={16} aria-hidden="true" /></span>
            <div><strong>{t.shops[active].job}</strong><p>{t.shops[active].detail}</p></div>
          </div>
          <a className="mkt-home__button mkt-home__button--green" href="/demo">{t.hero.demo}<ArrowRight size={16} aria-hidden="true" /></a>
        </aside>
      </div>
      <div className="mkt-home__vehicle-meta">
        {t.vehicle.meta.map(([label, value], index) => {
          const Icon = META_ICONS[index];
          return <div key={label}><Icon size={22} aria-hidden="true" /><span><strong>{value}</strong><small>{label}</small></span></div>;
        })}
      </div>
    </div>
  );
}
