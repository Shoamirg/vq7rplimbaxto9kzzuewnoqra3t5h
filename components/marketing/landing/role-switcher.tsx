"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, CarFront, Landmark, MonitorSmartphone, MousePointerClick, Wrench } from "lucide-react";

import { CustomerView } from "@/components/marketing/landing/customer-view";
import { AdvisorView, MechanicView, OwnerView } from "@/components/marketing/landing/staff-views";
import { useLanding } from "@/components/marketing/landing/use-landing";

// `screen` = real app screenshot (public/marketing/screens/{screen}-{locale}.webp),
// captured from the demo tenant. The car owner's Mini App needs Telegram sign-in,
// so that tab only has the interactive mock-up.
const ROLES = [
  { id: "customer", icon: CarFront, View: CustomerView, screen: null, path: null },
  { id: "advisor", icon: CalendarDays, View: AdvisorView, screen: "advisor", path: "calendar" },
  { id: "mechanic", icon: Wrench, View: MechanicView, screen: "mechanic", path: "vehicles" },
  { id: "owner", icon: Landmark, View: OwnerView, screen: "owner", path: "dashboard" },
];

const KEY_TARGETS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index + count - 1) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

type Mode = "real" | "interactive";

export function RoleSwitcher() {
  const { t } = useLanding();
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("real");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const role = ROLES[active];
  const showScreen = role.screen !== null && mode === "real";

  function focusTab(index: number) {
    setActive(index);
    tabs.current[index]?.focus();
    tabs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <section className="lp-section lp-shell" id="roles" aria-labelledby="roles-title">
      <h2 id="roles-title" className="lp-display lp-section__title">{t.roles.heading}</h2>
      <div className="lp-roles__bar">
        <div className="lp-scroller lp-tabs" role="tablist" aria-label={t.roles.label} data-testid="marketing-role-carousel">
          {ROLES.map(({ id, icon: Icon }, index) => (
            <button key={id} type="button" role="tab" id={`role-tab-${id}`} aria-controls="role-panel"
              aria-selected={active === index} tabIndex={active === index ? 0 : -1} className="lp-chip"
              ref={(node) => { tabs.current[index] = node; }} onClick={() => setActive(index)}
              onKeyDown={(event) => {
                const target = KEY_TARGETS[event.key]?.(index, ROLES.length);
                if (target !== undefined) { event.preventDefault(); focusTab(target); }
              }}>
              <Icon size={16} aria-hidden="true" />{t.roles.tabs[index]}
            </button>
          ))}
        </div>
        {role.screen && (
          <div className="lp-seg lp-roles__mode" role="group" aria-label={t.roles.modeLabel} data-testid="role-view-mode">
            <button type="button" aria-pressed={mode === "real"} onClick={() => setMode("real")}>
              <MonitorSmartphone size={14} aria-hidden="true" />{t.roles.real}
            </button>
            <button type="button" aria-pressed={mode === "interactive"} onClick={() => setMode("interactive")}>
              <MousePointerClick size={14} aria-hidden="true" />{t.roles.interactive}
            </button>
          </div>
        )}
      </div>
      <div className="lp-role-panel" id="role-panel" role="tabpanel" aria-labelledby={`role-tab-${role.id}`}
        data-testid="showroom-panel" data-role={role.id} data-mode={showScreen ? "real" : "interactive"}>
        {showScreen ? <RealScreen key={role.id} screen={role.screen!} path={role.path!} alt={t.roles.realAlt[active]} /> : <role.View key={role.id} />}
      </div>
    </section>
  );
}

function RealScreen({ screen, path, alt }: { screen: string; path: string; alt: string }) {
  const { locale, t } = useLanding();
  return (
    <figure className="lp-screen">
      <div className="lp-screen__bar" aria-hidden="true">
        <span /><span /><span />
        <small>garageos.uz/{path}</small>
      </div>
      <Image src={`/marketing/screens/${screen}-${locale}.webp`} alt={alt} width={1440} height={900}
        className="lp-screen__img" data-testid="role-screenshot" loading="lazy" unoptimized />
      <figcaption>{t.roles.realCaption}</figcaption>
    </figure>
  );
}
