"use client";

import { useState } from "react";
import { Bell, CalendarDays, Camera, Check, MapPin, Siren, Truck } from "lucide-react";

import { CarBlueprint, RadialGauge } from "@/components/marketing/landing/car-blueprint";
import { useLanding } from "@/components/marketing/landing/use-landing";

// Advisor bay calendar: [bay][column] → booked plate or empty. Column 1 holds the featured slot.
const BAY_GRID = [["01 A 123 BC", null, "10 K 777 AA"], [null, "slot", null], ["30 B 450 DA", "01 Z 900 ZZ", null]];

export function AdvisorView() {
  const { t: { advisor: t } } = useLanding();
  const [reminded, setReminded] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  return (
    <div className="lp-bento lp-bento--advisor">
      <article className="lp-card lp-card--calendar">
        <header className="lp-card__head"><CalendarDays size={18} aria-hidden="true" /><h4>{t.calendar}</h4></header>
        <div className="lp-bays">
          {t.bays.map((bay, row) => (
            <div className="lp-bays__row" key={bay}>
              <span className="lp-bays__label">{bay}</span>
              {BAY_GRID[row].map((cell, column) => (
                <span key={column} className="lp-bays__cell" data-state={cell === "slot" ? "active" : cell ? "busy" : "free"}>
                  {cell === "slot" ? <><strong>{t.slot}</strong><small>{t.plate}</small></> : cell}
                </span>
              ))}
            </div>
          ))}
        </div>
      </article>
      <article className="lp-card lp-card--remind">
        <header className="lp-card__head"><Bell size={18} aria-hidden="true" /><h4>{t.remind}</h4></header>
        <p className="lp-telegram__bubble lp-telegram__bubble--small" data-sent={reminded}>{t.reminderPreview}</p>
        <button type="button" className={`lp-btn lp-btn--block ${reminded ? "lp-btn--ghost" : "lp-btn--emerald"}`} aria-pressed={reminded} onClick={() => setReminded(!reminded)}>
          {reminded ? t.reminded : t.remind}
        </button>
      </article>
      <article className="lp-card lp-card--sos">
        <header className="lp-card__head"><Siren size={18} aria-hidden="true" /><h4>{t.sos}</h4></header>
        <div className="lp-map" aria-hidden="true">
          <span className="lp-map__pin"><MapPin size={22} /></span>
          {dispatched && <span className="lp-map__tow"><Truck size={18} /></span>}
        </div>
        <p className="lp-card__meta">{t.sosDetail}</p>
        <button type="button" className={`lp-btn lp-btn--block ${dispatched ? "lp-btn--ghost" : "lp-btn--obsidian"}`} aria-pressed={dispatched} onClick={() => setDispatched(!dispatched)}>
          {dispatched ? t.dispatched : t.dispatch}
        </button>
      </article>
    </div>
  );
}

export function MechanicView() {
  const { t } = useLanding();
  const [pin, setPin] = useState("brakes");
  const finding = t.hotspots.find((spot) => spot.id === pin) ?? t.hotspots[0];
  const pinLabels = Object.fromEntries(t.hotspots.map((spot) => [spot.id, spot.label]));
  return (
    <div className="lp-bento lp-bento--mechanic">
      <article className="lp-card lp-card--paper">
        <header className="lp-card__head"><h4>{t.mechanic.title}</h4><span className="lp-pill lp-pill--soft">{t.mechanic.hint}</span></header>
        <CarBlueprint label={t.telemetry.diagram} activePin={pin} onPin={setPin} pinLabels={pinLabels} />
      </article>
      <article className="lp-card lp-card--finding" aria-live="polite">
        <RadialGauge value={95} display="95%" label={t.mechanic.health} />
        <div className="lp-finding">
          <span className="lp-finding__photo"><Camera size={20} aria-hidden="true" /></span>
          <strong>{finding.label}</strong>
          <small>{finding.finding}</small>
          <small className="lp-finding__meta"><Check size={13} aria-hidden="true" />{t.mechanic.photo}</small>
        </div>
      </article>
    </div>
  );
}

const OCCUPANCY = [98, 94, 91];

export function OwnerView() {
  const { t: { owner: t } } = useLanding();
  const [period, setPeriod] = useState(0);
  return (
    <article className="lp-card lp-card--obsidian lp-ledger">
      <header className="lp-card__head">
        <h4>{t.title}</h4>
        <div className="lp-seg lp-seg--dark" role="group" aria-label={t.title}>
          {t.periods.map((label, index) => (
            <button key={label} type="button" aria-pressed={period === index} onClick={() => setPeriod(index)}>{label}</button>
          ))}
        </div>
      </header>
      <div className="lp-ledger__grid" aria-live="polite">
        <div className="lp-ledger__hero">
          <small>{t.revenueLabel}</small>
          <strong key={period} className="lp-kpi__value">{t.revenue[period]}</strong>
        </div>
        <div><strong>0</strong><small>{t.leaks}</small></div>
        <div><strong>{OCCUPANCY[period]}%</strong><small>{t.occupancy}</small></div>
        <div><strong>{t.jobCounts[period]}</strong><small>{t.jobs}</small></div>
      </div>
      <div className="lp-bars" aria-hidden="true">
        {[42, 58, 50, 74, 66, 88, OCCUPANCY[period]].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
      </div>
    </article>
  );
}
