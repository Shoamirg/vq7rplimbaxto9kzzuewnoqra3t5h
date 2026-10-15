"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, CarFront, ClipboardCheck, CircleUserRound, Wrench } from "lucide-react";
import { useMarketingI18n } from "@/components/marketing/marketing-i18n-provider";

const VIEWS = [
  { id: "owner", icon: CircleUserRound, image: "/marketing/dashboard.png" },
  { id: "advisor", icon: CalendarDays, image: "/marketing/calendar.png" },
  { id: "mechanic", icon: Wrench, image: "/marketing/vehicle-health.png" },
  { id: "customer", icon: CarFront, image: null },
];

export function ShowroomSwitcher() {
  const { messages: { landing: t } } = useMarketingI18n();
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const view = VIEWS[active];
  const copy = t.roles[active];

  function selectTab(index: number) {
    setActive(index);
    buttons.current[index]?.focus();
    buttons.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <div className="mkt-home__switcher" data-testid="showroom-switcher">
      <div className="mkt-home__switcher-tabs" role="tablist" aria-label={t.rolesLabel} data-testid="marketing-role-carousel">
        {VIEWS.map(({ id, icon: Icon }, index) => (
          <button type="button" key={id} role="tab" id={`role-tab-${id}`} aria-controls="role-preview" aria-selected={active === index}
            tabIndex={active === index ? 0 : -1} ref={(node) => { buttons.current[index] = node; }}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const target = event.key === "ArrowRight" ? (index + 1) % VIEWS.length
                : event.key === "ArrowLeft" ? (index + VIEWS.length - 1) % VIEWS.length
                : event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : null;
              if (target !== null) { event.preventDefault(); selectTab(target); }
            }}>
            <Icon size={16} aria-hidden="true" /><span>{t.roles[index].label}</span>
          </button>
        ))}
      </div>
      <div className="mkt-home__switcher-panel" id="role-preview" role="tabpanel" aria-labelledby={`role-tab-${view.id}`} tabIndex={0} data-testid="showroom-panel">
        <div className="mkt-home__switcher-copy">
          <span className="mkt-home__preview-label"><ClipboardCheck size={15} aria-hidden="true" />{t.preview}</span>
          <h3>{copy.title}</h3><p>{copy.detail}</p>
          <a href="/demo" className="mkt-home__text-link">{t.hero.demo}<span aria-hidden="true">→</span></a>
        </div>
        {view.image ? (
          <figure>
            <div className="mkt-home__switcher-image"><Image src={view.image} alt={copy.alt} fill unoptimized /></div>
            <figcaption className="mkt-home__screenshot-note">{t.screenshot}</figcaption>
          </figure>
        ) : (
          <div className="mkt-home__phone-preview" aria-label={copy.alt}>
            <div className="mkt-home__phone-top"><span /><strong>GarageOS</strong><span aria-hidden="true">•••</span></div>
            <p className="mkt-home__phone-greeting">{t.phone.greeting}</p>
            <div className="mkt-home__phone-car"><CarFront size={26} aria-hidden="true" /><span><strong>{t.phone.vehicle}</strong><small>{t.phone.detail}</small></span></div>
            <div className="mkt-home__phone-actions">{t.phone.actions.map((label) => <span key={label}>{label}</span>)}</div>
            <div className="mkt-home__phone-booking"><span>{t.phone.booking}</span><strong>{t.phone.request}</strong></div>
            <small className="mkt-home__phone-caption">{t.vehicle.sample}</small>
          </div>
        )}
      </div>
    </div>
  );
}
