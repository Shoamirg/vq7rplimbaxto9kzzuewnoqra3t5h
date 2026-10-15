"use client";

import { useState } from "react";
import { CarFront, CircleDot, Sparkles } from "lucide-react";
import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

const SHOP_TYPES = [
  { id: "general", icon: CarFront },
  { id: "tires", icon: CircleDot },
  { id: "detailing", icon: Sparkles },
];

export function VehicleShowroom() {
  const { messages: { landing: t } } = useMarketingI18n();
  const [active, setActive] = useState(0);
  return (
    <div className="mkt-home__shop-preview">
      <div className="mkt-home__shop-types" role="group" aria-label={t.hero.shopLabel} data-testid="marketing-shop-carousel">
        {SHOP_TYPES.map(({ id, icon: Icon }, index) => (
          <button key={id} type="button" aria-pressed={active === index} data-testid={`shop-type-${id}`} onClick={() => setActive(index)}>
            <Icon size={16} aria-hidden="true" />{t.shops[index].label}
          </button>
        ))}
      </div>
      <div className="mkt-home__showcase" role="group" aria-label={t.vehicle.preview}>
        <div className="mkt-home__showcase-top">
          <span className="mkt-home__window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{t.vehicle.label}</span>
          <span className="mkt-home__sample"><span />{t.vehicle.sample}</span>
        </div>
        <div className="mkt-home__vehicle-stage">
          <div className="mkt-home__stage-label">GARAGEOS / 001</div>
        <svg className="mkt-home__vehicle-art" viewBox="0 0 800 330" role="img" aria-label={t.vehicle.alt}>
          <defs>
            <linearGradient id="garage-car-body" x1="0" x2="0.15" y1="0" y2="1">
              <stop offset="0" stopColor="#f9fafb" />
              <stop offset="0.42" stopColor="#d8dde1" />
              <stop offset="1" stopColor="#929da5" />
            </linearGradient>
            <linearGradient id="garage-car-glass" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#64717a" />
              <stop offset="1" stopColor="#263138" />
            </linearGradient>
            <linearGradient id="garage-car-wheel" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#59636a" />
              <stop offset="1" stopColor="#20262b" />
            </linearGradient>
          </defs>
          <ellipse cx="401" cy="274" rx="306" ry="22" fill="#373e42" opacity="0.16" />
          <path d="M82 235c9-22 30-36 71-43l65-12 66-75c14-16 34-24 57-25h124c29 0 51 10 70 30l70 71 64 11c37 7 61 22 72 46l-5 19H86z" fill="url(#garage-car-body)" stroke="#89939a" strokeWidth="3" />
          <path d="m239 177 58-65c12-14 27-20 46-20h45v85z" fill="url(#garage-car-glass)" stroke="#f5f7f8" strokeWidth="5" />
          <path d="M401 92h61c22 0 39 8 54 25l54 60H401z" fill="url(#garage-car-glass)" stroke="#f5f7f8" strokeWidth="5" />
          <path d="M399 94v142m-162-49h367m-176 2v84" fill="none" stroke="#7e898f" strokeWidth="3" opacity="0.68" />
          <path d="M103 228c20-18 39-24 64-27m531 3c28 7 45 17 55 32" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.65" />
          <path d="M102 232h35m523 0h54" stroke="#f6c56f" strokeWidth="7" strokeLinecap="round" />
          <circle cx="235" cy="247" r="53" fill="#262c30" />
          <circle cx="235" cy="247" r="34" fill="url(#garage-car-wheel)" stroke="#aeb6bb" strokeWidth="5" />
          <circle cx="235" cy="247" r="12" fill="#d7dde0" />
          <circle cx="576" cy="247" r="53" fill="#262c30" />
          <circle cx="576" cy="247" r="34" fill="url(#garage-car-wheel)" stroke="#aeb6bb" strokeWidth="5" />
          <circle cx="576" cy="247" r="12" fill="#d7dde0" />
          <path d="M177 199h-26m478-4 41 7" stroke="#737d83" strokeWidth="3" strokeLinecap="round" />
        </svg>
          <div className="mkt-home__stage-note mkt-home__stage-note--left" data-testid="shop-preview" aria-live="polite" aria-atomic="true">
            <strong>{t.shops[active].job}</strong><span>{t.shops[active].detail}</span>
          </div>
          <div className="mkt-home__stage-note mkt-home__stage-note--right">
            <strong>{t.vehicle.linked}</strong><span>{t.vehicle.mileage}</span>
          </div>
        </div>
        <div className="mkt-home__vehicle-meta">
          {t.vehicle.meta.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
        </div>
      </div>
    </div>
  );
}
