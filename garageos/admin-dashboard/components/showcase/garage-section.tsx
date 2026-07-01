"use client";

import { Wrench, Clock, Phone } from "lucide-react";
import { HealthGauge } from "@/components/vehicles/health-gauge";
import { Section, Specimen } from "./kit";

// A faithful, static mechanic-lane appointment card (the real one lives inside
// calendar-client; this mirrors its look for the catalog).
function AppointmentCardSpecimen() {
  return (
    <div className="w-56 rounded-lg border border-border bg-card p-2.5 border-l-4 border-l-emerald-500 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wrench className="size-3.5 text-muted-foreground" /> Oil &amp; Filter Change
        </div>
        <span className="size-2 rounded-full bg-emerald-500" />
      </div>
      <p className="mt-1 text-xs text-foreground">Ford Focus (MXG2156)</p>
      <p className="text-xs text-muted-foreground">Emily Ahmed</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3" /> 09:00 · 60m
      </p>
    </div>
  );
}

function MechanicLaneSpecimen() {
  return (
    <div className="w-56 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="size-2.5 rounded-full bg-amber-500" /> Dmitri Volkov
          </div>
          <span className="text-xs text-muted-foreground">50%</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div className="h-full w-1/2 rounded-full bg-amber-500" />
        </div>
      </div>
    </div>
  );
}

function FleetBarSpecimen() {
  const rows = [
    ["Excellent", "bg-emerald-500", "w-4/5", 34],
    ["Good", "bg-green-500", "w-1/4", 12],
    ["Fair", "bg-amber-500", "w-[12%]", 6],
    ["Poor", "bg-red-500", "w-[14%]", 8],
  ] as const;
  return (
    <div className="w-64 space-y-2">
      {rows.map(([label, color, w, n]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-16 text-xs text-muted-foreground">{label}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${color} ${w}`} />
          </div>
          <span className="w-5 text-right text-xs font-medium text-foreground">{n}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarHeaderSpecimen() {
  return (
    <div className="w-full flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-foreground">Calendar</span>
        <span className="flex items-center gap-1 text-xs text-emerald-600"><span className="size-2 rounded-full bg-emerald-500" /> Live</span>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
        <span className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground">Day</span>
        <span className="px-3 py-1 text-xs text-muted-foreground">Week</span>
        <span className="px-3 py-1 text-xs text-muted-foreground">Month</span>
      </div>
    </div>
  );
}

function PassportSpecimen() {
  // A QR-like grid placeholder for the digital passport.
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-5 gap-0.5 p-2 rounded-lg bg-white">
        {Array.from({ length: 25 }).map((_, i) => (
          <span key={i} className={`size-3 rounded-[2px] ${(i * 7) % 3 === 0 ? "bg-foreground" : "bg-transparent"}`} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Digital Passport</p>
        <p>Scan for full history</p>
      </div>
    </div>
  );
}

export function GarageSection() {
  return (
    <Section id="garage" kicker="Garage Components" title="Domain-specific building blocks">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Specimen label="HealthGauge · excellent">
          <HealthGauge score={96} band="excellent" size={132} />
        </Specimen>
        <Specimen label="HealthGauge · good">
          <HealthGauge score={73} band="good" size={132} />
        </Specimen>
        <Specimen label="HealthGauge · poor">
          <HealthGauge score={32} band="poor" size={132} />
        </Specimen>
        <Specimen label="AppointmentCard"><AppointmentCardSpecimen /></Specimen>
        <Specimen label="MechanicLane header"><MechanicLaneSpecimen /></Specimen>
        <Specimen label="FleetBar distribution"><FleetBarSpecimen /></Specimen>
        <Specimen label="Calendar header" className="sm:col-span-2"><CalendarHeaderSpecimen /></Specimen>
        <Specimen label="Vehicle Passport"><PassportSpecimen /></Specimen>
      </div>
    </Section>
  );
}
