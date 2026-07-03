"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  LifeBuoy,
  MessageSquare,
  Receipt,
} from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { HomeResponse } from "@/lib/mini/types";
import { Card, HealthRing, Loading, SectionLabel, money } from "@/components/mini/ui";

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function HomePage() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    miniFetch<HomeResponse>("/home").then(setHome).catch(() => setError(true));
  }, []);

  if (error) return <p className="p-6 text-center text-sm text-slate-400">Couldn&apos;t load your garage.</p>;
  if (!home) return <div className="pt-2"><Loading /></div>;

  const v = home.primary_vehicle;

  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="text-sm font-medium text-slate-400">{home.garage.name}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
          Hi, {home.greeting} 👋
        </h1>
      </header>

      {/* SOS — impossible to miss */}
      <Link
        href="/mini/roadside"
        className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 p-4 text-white shadow-[0_12px_32px_-10px_rgba(220,38,38,0.6)] transition active:scale-[0.99]"
      >
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20">
          <LifeBuoy className="size-7" />
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold leading-tight">Need help now?</p>
          <p className="text-sm text-white/85">Roadside assistance · live tracking</p>
        </div>
        <ChevronRight className="size-5 text-white/80" />
      </Link>

      {/* Upcoming appointment */}
      {home.next_appointment ? (
        <div>
          <SectionLabel>Upcoming</SectionLabel>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <CalendarClock className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {home.next_appointment.service_type ?? "Service appointment"}
                </p>
                <p className="text-sm text-slate-500">
                  {fmtDate(home.next_appointment.date)}
                  {home.next_appointment.time ? ` · ${home.next_appointment.time}` : ""}
                  {home.next_appointment.vehicle_label ? ` · ${home.next_appointment.vehicle_label}` : ""}
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Outstanding invoice */}
      {home.outstanding_balance > 0.005 ? (
        <Card href="/mini/billing" className="!bg-amber-50 !ring-amber-200/60">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <Receipt className="size-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Balance due</p>
              <p className="text-sm text-amber-700">
                {home.outstanding_invoice ? `Invoice ${home.outstanding_invoice.code}` : "Tap to pay"}
              </p>
            </div>
            <p className="text-lg font-bold text-slate-900">{money(home.outstanding_balance)}</p>
          </div>
        </Card>
      ) : null}

      {/* Latest message */}
      {home.latest_message ? (
        <Card href={`/mini/messages/${home.latest_message.id}`}>
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <MessageSquare className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-slate-900">
                  {home.latest_message.subject ?? "Conversation"}
                </p>
                {home.latest_message.awaiting_you ? (
                  <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                ) : null}
              </div>
              <p className="truncate text-sm text-slate-500">{home.latest_message.preview ?? "Open thread"}</p>
            </div>
            <ChevronRight className="size-5 text-slate-300" />
          </div>
        </Card>
      ) : null}

      {/* Vehicle health */}
      {v ? (
        <div>
          <SectionLabel>Your vehicle</SectionLabel>
          <Card href={`/mini/vehicles/${v.id}`}>
            <div className="flex items-center gap-4">
              <HealthRing score={v.health_score} band={v.band} size={60} />
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{v.label}</p>
                <p className="text-sm capitalize text-slate-500">
                  {v.passport_tier ? `${v.passport_tier} Certified · ` : ""}
                  Health {v.band}
                </p>
              </div>
              <ChevronRight className="size-5 text-slate-300" />
            </div>
          </Card>
        </div>
      ) : null}

      {/* Recent activity */}
      {home.activity.length > 0 ? (
        <div>
          <SectionLabel>Recent activity</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {home.activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-2 py-3">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <Bell className="size-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    {a.detail ? <p className="text-sm text-slate-500">{a.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-slate-400">{fmtDate(a.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
