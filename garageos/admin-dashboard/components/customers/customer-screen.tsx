"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone, Mail, Send, Car, Clock, DollarSign, CalendarClock, ShieldAlert,
  QrCode, Wrench, Sparkles, Star, MapPin, MessageSquare, FileText, StickyNote,
  Gauge, ArrowRight,
} from "lucide-react";
import { Badge, Button, cn } from "@garageos/design-system";

import { HealthGauge } from "@/components/vehicles/health-gauge";
import { EmptyState } from "@/components/states/empty-state";
import type { Customer360, HealthBand } from "@/lib/api/types";

const BAND_TEXT: Record<HealthBand, string> = {
  excellent: "text-emerald-600", good: "text-green-600", fair: "text-amber-600", poor: "text-red-600",
};

const TL_SEVERITY: Record<string, string> = {
  critical: "bg-red-600", high: "bg-red-500", medium: "bg-amber-500", low: "bg-blue-500", info: "bg-slate-400",
};

const TABS = [
  "Overview", "Vehicles", "Passports", "Timeline", "Appointments",
  "Messages", "Emergency", "Invoices", "Documents", "Notes",
] as const;
type Tab = (typeof TABS)[number];

const nf = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function CustomerScreen({ customer }: { customer: Customer360 }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const c = customer;
  const since = c.since ? new Date(c.since).getFullYear() : null;

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground">← Customers</Link>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary text-xl font-bold shrink-0">
            {monogram(c.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{c.full_name}</h1>
              {c.tier.stars > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <Star className="size-3 fill-current" /> {c.tier.label}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {since ? `Customer since ${since}` : "Customer"}
              {c.address ? ` · ${c.address}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {c.phone && <Button variant="outline" size="sm" leftIcon={<Phone className="size-4" />}>Call</Button>}
            {c.email && <Button variant="outline" size="sm" leftIcon={<Mail className="size-4" />}>Email</Button>}
            {c.has_telegram && <Button variant="outline" size="sm" leftIcon={<Send className="size-4" />}>Telegram</Button>}
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={Car} label="Vehicles" value={String(c.stats.vehicle_count)} />
          <Stat icon={DollarSign} label="Lifetime value" value={money(c.stats.lifetime_value)} />
          <Stat icon={Gauge} label="Avg health" value={`${c.stats.health_avg}`} valueClass={BAND_TEXT[c.stats.health_band]} />
          <Stat icon={Clock} label="Last visit" value={fmtDate(c.stats.last_visit)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview customer={c} />}
      {tab === "Vehicles" && <Vehicles customer={c} />}
      {tab === "Passports" && <Passports customer={c} />}
      {tab === "Timeline" && <Timeline customer={c} />}
      {tab === "Appointments" && <Appointments customer={c} />}
      {tab === "Messages" && <Placeholder icon={MessageSquare} title="Conversations arrive with the Support Center" body="Telegram, chat, voice notes, and emergency threads will unify here as one conversation tied to this customer." />}
      {tab === "Emergency" && <Placeholder icon={ShieldAlert} title="Emergency history arrives with the Emergency Center" body="Roadside cases, tow dispatches, live location, and photos will appear here, linked to this customer's timeline." />}
      {tab === "Invoices" && <Placeholder icon={FileText} title="Invoices arrive with the Billing module" body="Estimates, invoices, and payments will live here and feed lifetime value automatically." />}
      {tab === "Documents" && <Placeholder icon={FileText} title="No documents yet" body="Inspection reports, warranties, and uploads will be stored here per customer." />}
      {tab === "Notes" && <Placeholder icon={StickyNote} title="No notes yet" body="Staff notes and preferences for this customer will be captured here." />}
    </div>
  );
}

function Stat({ icon: Icon, label, value, valueClass }: { icon: React.ElementType; label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border p-3 flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground shrink-0"><Icon className="size-4" /></span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-semibold text-foreground truncate", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function Overview({ customer: c }: { customer: Customer360 }) {
  const answers = [
    { icon: Car, label: "Vehicles", value: `${c.stats.vehicle_count} on file` },
    { icon: Gauge, label: "Fleet health", value: `${c.stats.health_avg} · ${c.stats.health_band}` },
    { icon: CalendarClock, label: "Next booking", value: c.stats.next_booking ? fmtDate(c.stats.next_booking) : "None scheduled" },
    { icon: Clock, label: "Last visit", value: fmtDate(c.stats.last_visit) },
    { icon: DollarSign, label: "Outstanding", value: c.stats.outstanding > 0 ? money(c.stats.outstanding) : "None" },
    { icon: ShieldAlert, label: "Emergencies", value: c.stats.emergency_count > 0 ? String(c.stats.emergency_count) : "None" },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">At a glance</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {answers.map((a) => (
              <div key={a.label} className="flex items-start gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground shrink-0"><a.icon className="size-4" /></span>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a.label}</p>
                  <p className="text-sm font-medium text-foreground">{a.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <VehicleCards customer={c} />
      </div>
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-5 h-fit">
        <div className="flex items-center gap-2 text-primary mb-2">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">AI Summary</span>
          <Badge variant="primary" size="sm">Beta</Badge>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{c.ai_summary}</p>
      </div>
    </div>
  );
}

function VehicleCards({ customer: c }: { customer: Customer360 }) {
  if (c.vehicles.length === 0) {
    return <EmptyState compact icon={Car} title="No vehicles on file" description="Add a vehicle to start tracking its health and passport." />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {c.vehicles.map((v) => (
        <div key={v.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <HealthGauge score={v.score} band={v.band} size={72} stroke={7} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{v.label}</p>
            <p className="text-xs text-muted-foreground">{v.year} · {nf(v.current_km)} km</p>
            <div className="flex items-center gap-3 mt-2">
              <Link href={`/vehicles/${v.id}`} className="text-xs text-primary hover:underline flex items-center gap-1"><Wrench className="size-3" /> Health</Link>
              <Link href={`/passport/${v.id}`} target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1"><QrCode className="size-3" /> Passport</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Vehicles({ customer: c }: { customer: Customer360 }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><VehicleCards customer={c} /></div>;
}

function Passports({ customer: c }: { customer: Customer360 }) {
  if (c.vehicles.length === 0) return <Placeholder icon={QrCode} title="No passports yet" body="Each vehicle gets a certified passport once it's on file." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {c.vehicles.map((v) => (
        <Link key={v.id} href={`/passport/${v.id}`} target="_blank"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><QrCode className="size-3.5" /> Verified</span>
            <span className={cn("text-lg font-bold", BAND_TEXT[v.band])}>{Math.round(v.score)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground truncate">{v.label}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.passport_code}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary group-hover:gap-2 transition-all">
            Open passport <ArrowRight className="size-3" />
          </span>
        </Link>
      ))}
    </div>
  );
}

function Timeline({ customer: c }: { customer: Customer360 }) {
  if (c.timeline.length === 0) return <Placeholder icon={Clock} title="No history yet" body="Services, appointments, and messages will appear here as one continuous history." />;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
        {c.timeline.map((e, i) => {
          const isEvent = e.type.startsWith("event_");
          const dot = isEvent ? (TL_SEVERITY[e.severity ?? "info"])
            : e.type === "service" ? "bg-emerald-500" : "bg-primary";
          return (
            <div key={i} className="relative pb-5 last:pb-0">
              <span className={cn("absolute -left-[19px] top-0.5 size-3 rounded-full ring-2 ring-card", dot)} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{e.title}</p>
                  {e.detail && <p className="text-xs text-muted-foreground truncate">{e.detail}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>
                  {e.cost != null && <p className="text-xs font-medium text-foreground">{money(e.cost)}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const APPT_VARIANT: Record<string, string> = {
  pending: "warning", confirmed: "info", in_progress: "primary", completed: "success", cancelled: "danger", rescheduled: "neutral",
};

function Appointments({ customer: c }: { customer: Customer360 }) {
  if (c.appointments.length === 0) return <Placeholder icon={CalendarClock} title="No appointments" body="This customer has no appointment history yet." />;
  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {c.appointments.map((a) => (
        <div key={a.id} className="flex items-center gap-4 p-4">
          <div className="text-center min-w-[64px]">
            <p className="text-xs font-medium text-foreground">{fmtDate(a.date)}</p>
            <p className="text-[11px] text-muted-foreground">{a.time}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{a.mechanic_name ?? "Unassigned"}</p>
            <p className="text-xs text-muted-foreground">{a.duration} min{a.total_cost != null ? ` · ${money(a.total_cost)}` : ""}</p>
          </div>
          <Badge variant={(APPT_VARIANT[a.status] ?? "neutral") as never} size="sm">{a.status.replace("_", " ")}</Badge>
        </div>
      ))}
    </div>
  );
}

function Placeholder({ icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <EmptyState icon={icon as never} title={title} description={body} />
    </div>
  );
}
