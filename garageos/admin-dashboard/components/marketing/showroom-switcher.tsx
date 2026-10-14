"use client";

import { useState } from "react";
import Image from "next/image";
import { CalendarDays, CarFront, ClipboardCheck, CircleUserRound, Wrench } from "lucide-react";

const VIEWS = [
  { id: "owner", label: "Garage owner", icon: CircleUserRound, title: "Know where the shop stands.", detail: "A shared overview of appointments, vehicle health, and the work moving through the garage.", image: "/marketing/dashboard.png", alt: "Sample GarageOS owner dashboard" },
  { id: "advisor", label: "Service advisor", icon: CalendarDays, title: "Keep the front desk in sync.", detail: "See bookings and mechanic lanes together, then open the right customer and vehicle record.", image: "/marketing/calendar.png", alt: "Sample GarageOS service calendar" },
  { id: "mechanic", label: "Mechanic", icon: Wrench, title: "Focus on assigned work.", detail: "Review the vehicle, job notes, and service history before updating the work order.", image: "/marketing/vehicle-health.png", alt: "Sample GarageOS vehicle service record" },
  { id: "customer", label: "Car owner", icon: CarFront, title: "Give customers one place to check.", detail: "A customer view for their vehicles, service history, invoices, and appointment requests.", image: null, alt: "" },
] as const;

export function ShowroomSwitcher() {
  const [active, setActive] = useState<(typeof VIEWS)[number]["id"]>("owner");
  const view = VIEWS.find((item) => item.id === active) ?? VIEWS[0];

  return (
    <div className="mkt-home__switcher" data-testid="showroom-switcher">
      <div className="mkt-home__switcher-tabs" role="group" aria-label="Choose a GarageOS role preview">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={active === id}
            onClick={() => setActive(id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="mkt-home__switcher-panel" aria-live="polite" data-testid="showroom-panel">
        <div className="mkt-home__switcher-copy">
          <span className="mkt-home__preview-label"><ClipboardCheck size={15} /> Illustrative product preview</span>
          <h3>{view.title}</h3>
          <p>{view.detail}</p>
          <a href="/demo" className="mkt-home__text-link">Open the read-only demo <span aria-hidden="true">→</span></a>
        </div>

        {view.image ? (
          <div className="mkt-home__switcher-image">
            <Image src={view.image} alt={view.alt} fill sizes="(max-width: 800px) 100vw, 56vw" />
          </div>
        ) : (
          <div className="mkt-home__phone-preview" aria-label="Illustrative customer portal preview">
            <div className="mkt-home__phone-top"><span /><strong>GarageOS</strong><span>•••</span></div>
            <p className="mkt-home__phone-greeting">Good morning</p>
            <div className="mkt-home__phone-car"><CarFront size={26} /><span><strong>Your vehicle</strong><small>Vehicle record and service history</small></span><span aria-hidden="true">›</span></div>
            <div className="mkt-home__phone-actions"><span>Vehicles</span><span>History</span><span>Invoices</span></div>
            <div className="mkt-home__phone-booking"><span>Need a visit?</span><strong>Request an appointment</strong></div>
            <small className="mkt-home__phone-caption">Illustrative preview · sample content</small>
          </div>
        )}
      </div>
    </div>
  );
}
