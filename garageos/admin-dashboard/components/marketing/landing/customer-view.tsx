"use client";

import { useState } from "react";
import { BatteryFull, Banknote, CalendarCheck, Check, CircleDot, CreditCard, Disc3, Droplet, Undo2, Wallet } from "lucide-react";

import { useLanding } from "@/components/marketing/landing/use-landing";

const HEALTH_ICONS = [Disc3, Droplet, CircleDot, BatteryFull];
const HEALTH_TONES = ["warn", "ok", "ok", "ok"];
const PAY_ICONS = [CreditCard, Wallet, Banknote];

/** Car owner: three Telegram Mini App screens in a swipeable phone carousel. */
export function CustomerView() {
  return (
    <div className="lp-scroller lp-phones">
      <BookingPhone />
      <HealthPhone />
      <ReceiptPhone />
    </div>
  );
}

function Phone({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <article className="lp-phone">
      <header className="lp-phone__bar"><span className="lp-phone__step">{step}</span><strong>{title}</strong></header>
      {children}
    </article>
  );
}

function BookingPhone() {
  const { t: { customer: t } } = useLanding();
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState(1);
  const [booked, setBooked] = useState(false);
  return (
    <Phone step="1" title={t.bookTitle}>
      <div className="lp-seg lp-seg--fill" role="group" aria-label={t.bookTitle}>
        {t.days.map((label, index) => (
          <button key={label} type="button" aria-pressed={day === index} onClick={() => { setDay(index); setBooked(false); }}>{label}</button>
        ))}
      </div>
      <div className="lp-slots">
        {t.slots.map((label, index) => (
          <button key={label} type="button" className="lp-slot" aria-pressed={slot === index} onClick={() => { setSlot(index); setBooked(false); }}>{label}</button>
        ))}
      </div>
      <button type="button" className="lp-btn lp-btn--obsidian lp-btn--block" aria-pressed={booked} onClick={() => setBooked(!booked)}>
        {booked ? <><CalendarCheck size={16} aria-hidden="true" />{t.booked}</> : t.book}
      </button>
    </Phone>
  );
}

function HealthPhone() {
  const { t: { customer: t } } = useLanding();
  const [approved, setApproved] = useState(false);
  return (
    <Phone step="2" title={t.healthTitle}>
      <ul className="lp-mini-grid">
        {t.health.map(([label, value], index) => {
          const Icon = HEALTH_ICONS[index];
          return (
            <li key={label} data-tone={approved && index === 0 ? "ok" : HEALTH_TONES[index]}>
              <Icon size={16} aria-hidden="true" /><strong>{value}</strong><small>{label}</small>
            </li>
          );
        })}
      </ul>
      <div className="lp-estimate" data-approved={approved}>
        <span>{t.estimateItem}</span><strong>{t.estimateAmount}</strong>
      </div>
      <p className="lp-estimate__status" data-testid="estimate-status" role="status">{approved ? t.approved : t.pending}</p>
      <button type="button" className={`lp-btn lp-btn--block ${approved ? "lp-btn--ghost" : "lp-btn--emerald"}`}
        aria-pressed={approved} data-testid="estimate-toggle" onClick={() => setApproved(!approved)}>
        {approved ? <><Undo2 size={16} aria-hidden="true" />{t.reset}</> : <><Check size={16} aria-hidden="true" />{t.approve}</>}
      </button>
    </Phone>
  );
}

function ReceiptPhone() {
  const { t: { customer: t } } = useLanding();
  const [method, setMethod] = useState(0);
  const Icon = PAY_ICONS[method];
  return (
    <Phone step="3" title={t.payTitle}>
      <div className="lp-receipt">
        <span>{t.estimateItem}</span><span>{t.estimateAmount}</span>
        <strong>{t.total}</strong><strong>{t.estimateAmount}</strong>
      </div>
      <div className="lp-seg lp-seg--fill" role="group" aria-label={t.paidVia}>
        {t.methods.map((label, index) => (
          <button key={label} type="button" aria-pressed={method === index} onClick={() => setMethod(index)}>{label}</button>
        ))}
      </div>
      <p className="lp-paid" role="status"><Icon size={16} aria-hidden="true" />{t.paidVia} {t.methods[method]} <Check size={15} aria-hidden="true" /></p>
    </Phone>
  );
}
