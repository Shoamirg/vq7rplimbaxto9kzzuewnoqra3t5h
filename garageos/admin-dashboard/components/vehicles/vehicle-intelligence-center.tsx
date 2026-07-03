"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  CalendarClock,
  Car,
  CircleDot,
  Cog,
  Disc3,
  FileText,
  Gauge,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@garageos/design-system";

import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clientFetch } from "@/lib/api/client";
import type { VehicleIntelligence } from "@/lib/api/types";

const BAND_COLOR: Record<string, string> = {
  excellent: "#16A34A", good: "#2563EB", fair: "#F59E0B", poor: "#DC2626",
};
const bandColor = (b: string) => BAND_COLOR[b] ?? "#64748B";
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const dateFmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

// subsystem → hotspot position (% of stage) + icon
const SYS_POS: Record<string, { x: number; y: number }> = {
  "Engine & Fluids": { x: 21, y: 44 },
  Transmission: { x: 46, y: 28 },
  General: { x: 63, y: 60 },
  Brakes: { x: 31, y: 80 },
  "Tires & Wheels": { x: 75, y: 80 },
  Battery: { x: 72, y: 34 },
  Electrical: { x: 72, y: 34 },
};
function sysIcon(name: string) {
  if (name.includes("Engine")) return Gauge;
  if (name.includes("Transmission")) return Cog;
  if (name.includes("Brake")) return Disc3;
  if (name.includes("Tire")) return CircleDot;
  if (name.includes("Batter") || name.includes("Electr")) return BatteryCharging;
  return Wrench;
}
const PRED_ICON: Record<string, typeof Wrench> = { wrench: Wrench, activity: Activity, alert: AlertTriangle, shield: ShieldCheck };
const PRED_TONE: Record<string, string> = {
  info: "bg-blue-50 text-blue-600", warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600", success: "bg-green-50 text-green-600",
};

function Ring({ score, band, size = 120 }: { score: number; band: string; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOff(c - (Math.max(0, Math.min(100, score)) / 100) * c));
    return () => cancelAnimationFrame(id);
  }, [c, score]);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bandColor(band)} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div className="absolute text-center">
        <b className="font-brand text-3xl font-extrabold leading-none text-white">{Math.round(score)}</b>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em]" style={{ color: bandColor(band) }}>{band}</span>
      </div>
    </div>
  );
}

function CarStage({ subsystems, onPick, active }: {
  subsystems: { name: string; score: number }[];
  onPick: (s: { name: string; score: number }) => void;
  active: string | null;
}) {
  const extra = [{ x: 60, y: 62 }, { x: 40, y: 60 }, { x: 84, y: 48 }];
  return (
    <div className="relative mt-2 grid h-[240px] place-items-center">
      <div className="twin-glow pointer-events-none absolute bottom-9 h-[110px] w-[380px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(37,99,235,.4), transparent)", filter: "blur(8px)" }} />
      <svg className="twin-float relative z-[2]" width="420" height="176" viewBox="0 0 440 180" fill="none">
        <defs>
          <linearGradient id="ic-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dfe7f2" /><stop offset="1" stopColor="#8aa0c4" /></linearGradient>
          <linearGradient id="ic-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3c5c" /><stop offset="1" stopColor="#0f1a30" /></linearGradient>
        </defs>
        <path d="M22 120 C 26 98, 52 96, 74 94 C 96 74, 126 66, 168 66 L 250 66 C 286 66, 312 78, 344 96 C 372 98, 404 102, 416 112 C 424 118, 424 128, 414 132 L 30 132 C 20 130, 18 126, 22 120 Z" fill="url(#ic-body)" />
        <path d="M96 92 C 112 78, 130 74, 162 74 L 210 74 L 210 92 Z" fill="url(#ic-glass)" />
        <path d="M220 74 L 250 74 C 280 74, 300 82, 322 92 L 220 92 Z" fill="url(#ic-glass)" />
        <rect x="30" y="126" width="384" height="6" rx="3" fill="#5b6b86" />
        <circle cx="112" cy="134" r="28" fill="#0b1220" /><circle cx="112" cy="134" r="15" fill="#334155" /><circle cx="112" cy="134" r="6" fill="#94a3b8" />
        <circle cx="330" cy="134" r="28" fill="#0b1220" /><circle cx="330" cy="134" r="15" fill="#334155" /><circle cx="330" cy="134" r="6" fill="#94a3b8" />
      </svg>
      {subsystems.map((s, i) => {
        const pos = SYS_POS[s.name] ?? extra[i % extra.length];
        const warn = s.score < 75;
        const isActive = active === s.name;
        return (
          <button key={s.name} onClick={() => onPick(s)} data-testid="vic-hotspot"
            className="absolute z-[3] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }} aria-label={`${s.name} ${Math.round(s.score)}`}>
            <span className="relative grid place-items-center">
              <span className={`absolute inline-flex h-6 w-6 rounded-full ${warn ? "bg-amber-400/40" : "bg-blue-500/40"} motion-safe:animate-ping`} />
              <span className={`relative size-3.5 rounded-full ring-4 ${warn ? "bg-amber-400 ring-amber-400/25" : "bg-blue-500 ring-blue-500/25"} ${isActive ? "scale-125" : ""} transition`} />
            </span>
            <span className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 shadow-lg">
              {s.name.replace(" & Fluids", "").replace(" & Wheels", "")} <b style={{ color: bandColor(scoreBand(s.score)) }}>{Math.round(s.score)}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function scoreBand(s: number): string {
  return s >= 90 ? "excellent" : s >= 70 ? "good" : s >= 40 ? "fair" : "poor";
}

const TABS = ["overview", "timeline", "passport", "documents"] as const;
type Tab = (typeof TABS)[number];

export function VehicleIntelligenceCenter({ data }: { data: VehicleIntelligence }) {
  const { identity: v, health, passport, commercial, predictions, maintenance, timeline, owner_context: owner } = data;
  const [tab, setTab] = useState<Tab>("overview");
  const [active, setActive] = useState<{ name: string; score: number } | null>(null);
  const [del, setDel] = useState(false);
  const [book, setBook] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const tier = passport.tier;

  return (
    <div className="animate-fade-in space-y-5 p-4 lg:p-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <Link href="/vehicles" className="hover:text-foreground">Vehicles</Link>
          <span className="mx-1.5">›</span>
          <b className="font-brand text-foreground">{v.brand} {v.model}</b>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/passport/${v.id}`} target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold text-amber-950 transition hover:brightness-105">
            <Star className="size-4" /> View Passport
          </Link>
          <button onClick={() => setBook(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800">
            <CalendarClock className="size-4" /> Book service
          </button>
          <button onClick={() => setDel(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground transition hover:text-red-600 hover:border-red-200">
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      {book && <NewAppointmentModal onClose={() => setBook(false)} onCreated={() => setBook(false)} />}
      {del && (
        <ConfirmDialog
          title="Delete this vehicle?"
          message={`${v.brand} ${v.model} will be archived and removed from your lists. Its owner and history stay in the system.`}
          confirmLabel="Delete vehicle"
          onClose={() => setDel(false)}
          onConfirm={async () => {
            try {
              await clientFetch(`/vehicles/${v.id}`, { method: "DELETE" });
              toast({ title: "Vehicle deleted", description: `${v.brand} ${v.model}`, variant: "success" });
              router.push("/vehicles");
            } catch {
              setDel(false);
              toast({ title: "Delete failed", description: "Please try again.", variant: "danger" });
            }
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-muted p-1 text-sm font-semibold sm:w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-4 py-1.5 capitalize transition sm:flex-none ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-5 lg:grid-cols-[300px_1fr_300px]">
            {/* LEFT — identity, commercial, AI */}
            <div className="space-y-5">
              <IdentityCard v={v} tier={tier} />
              {commercial && <CommercialCard c={commercial} />}
              <AiSummaryCard predictions={predictions} />
            </div>

            {/* CENTER — the digital twin hero */}
            <div data-testid="vic-hero" className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl"
              style={{ background: "radial-gradient(120% 90% at 30% 0%, #1a2740 0%, #0e1626 45%, #0B1220 100%)" }}>
              <div className="pointer-events-none absolute inset-0 opacity-50"
                style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.12) 1px,transparent 1px)", backgroundSize: "34px 34px", maskImage: "radial-gradient(70% 60% at 50% 40%,#000,transparent)" }} />
              <div className="relative z-[2] flex items-start justify-between">
                <div>
                  {tier && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-brand text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      <Star className="size-3" /> {tier} Certified
                    </span>
                  )}
                  <h1 className="font-brand mt-2 text-3xl font-extrabold tracking-tight">{v.brand} {v.model}</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    {[v.year, v.plate, v.engine, v.mileage ? `${v.mileage.toLocaleString()} km` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Ring score={health.overall_score} band={health.band} />
              </div>

              <CarStage subsystems={health.subsystems} onPick={(s) => setActive((cur) => (cur?.name === s.name ? null : s))} active={active?.name ?? null} />

              {/* subsystem detail on click */}
              {active ? (
                <div className="relative z-[2] mt-1 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-white/10">
                    {(() => { const I = sysIcon(active.name); return <I className="size-5 text-white" />; })()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{active.name}</p>
                    <p className="text-xs text-slate-400">
                      {active.score < 75 ? "Inspect at the next visit — lowest-scoring system." : "In good condition. No action needed."}
                    </p>
                  </div>
                  <div className="text-right">
                    <b className="font-brand text-2xl font-extrabold" style={{ color: bandColor(scoreBand(active.score)) }}>{Math.round(active.score)}</b>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">/ 100</span>
                  </div>
                </div>
              ) : (
                <div className="relative z-[2] mt-1 grid grid-cols-4 gap-2">
                  <Vital k="Mileage" val={v.mileage ? `${(v.mileage / 1000).toFixed(0)}k km` : "—"} />
                  <Vital k="Compliance" val={`${passport.compliance}%`} />
                  <Vital k="Owned" val={`${passport.vitals.ownership_years}y`} />
                  <Vital k="Lifetime" val={money(passport.vitals.total_spent)} />
                </div>
              )}
            </div>

            {/* RIGHT — timeline */}
            <div className="space-y-5">
              <TimelineCard events={timeline} compact />
              {owner && <OwnerCard owner={owner} commercial={commercial} />}
            </div>
          </div>

          {/* BOTTOM — passport, specs, maintenance */}
          <div className="grid gap-5 lg:grid-cols-3">
            <PassportCard passport={passport} vehicleId={v.id} />
            <SpecsCard v={v} />
            <MaintenanceCard items={maintenance} />
          </div>
        </>
      )}

      {tab === "timeline" && <Panel title="Service Timeline"><TimelineCard events={timeline} /></Panel>}
      {tab === "passport" && <div className="grid gap-5 lg:grid-cols-2"><PassportCard passport={passport} vehicleId={v.id} large /><SpecsCard v={v} /></div>}
      {tab === "documents" && (
        <Panel title="Documents">
          <div className="grid place-items-center rounded-2xl border border-dashed border-border py-14 text-center">
            <FileText className="size-8 text-muted-foreground/40" />
            <p className="mt-2 font-medium text-foreground">No documents yet</p>
            <p className="text-sm text-muted-foreground">Invoices, inspection reports, and warranties will appear here.</p>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── sub-cards ────────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</div>;
}
function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between"><h3 className="font-brand text-[15px] font-extrabold text-foreground">{children}</h3>{right}</div>;
}
function Vital({ k, val }: { k: string; val: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
    <div className="font-brand mt-0.5 text-base font-bold text-white">{val}</div>
  </div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardTitle>{title}</CardTitle>{children}</Card>;
}

function IdentityCard({ v, tier }: { v: VehicleIntelligence["identity"]; tier: string | null }) {
  const rows: [string, string | number | null][] = [
    ["Owner", v.owner_name], ["VIN", v.vin], ["Plate", v.plate],
    ["Mileage", v.mileage ? `${v.mileage.toLocaleString()} km` : null],
    ["Passport", tier ? `${tier} Certified` : "—"],
  ];
  return (
    <Card>
      <CardTitle>Identity</CardTitle>
      <div className="divide-y divide-border">
        {rows.filter(([, val]) => val).map(([k, val]) => (
          <div key={k} className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="max-w-[160px] truncate font-medium text-foreground">{val}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CommercialCard({ c }: { c: NonNullable<VehicleIntelligence["commercial"]> }) {
  return (
    <Card>
      <CardTitle right={<span className="text-amber-500">{"★".repeat(c.stars)}<span className="text-slate-300">{"★".repeat(5 - c.stars)}</span></span>}>Commercial</CardTitle>
      <p className="text-sm font-semibold capitalize text-foreground">{c.label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric k="Outstanding" val={money(c.outstanding)} tone={c.outstanding > 0 ? "amber" : "green"} />
        <Metric k="Lifetime" val={money(c.lifetime_value)} />
        <Metric k="Avg. pay" val={c.avg_days_to_pay != null ? `${c.avg_days_to_pay}d` : "—"} />
        <Metric k="Prefers" val={c.preferred_method ? c.preferred_method[0].toUpperCase() + c.preferred_method.slice(1) : "—"} />
      </div>
    </Card>
  );
}
function Metric({ k, val, tone }: { k: string; val: string; tone?: "amber" | "green" }) {
  const color = tone === "amber" ? "text-amber-600" : tone === "green" ? "text-green-600" : "text-foreground";
  return <div className="rounded-xl bg-muted/50 p-2.5">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
    <div className={`font-brand mt-0.5 text-base font-bold ${color}`}>{val}</div>
  </div>;
}

function AiSummaryCard({ predictions }: { predictions: VehicleIntelligence["predictions"] }) {
  return (
    <Card>
      <CardTitle right={<span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700"><Sparkles className="size-3" /> AI</span>}>GarageOS AI</CardTitle>
      <div className="space-y-3">
        {predictions.map((p, i) => {
          const I = PRED_ICON[p.icon] ?? Activity;
          return (
            <div key={i} className="flex gap-2.5">
              <div className={`grid size-7 shrink-0 place-items-center rounded-lg ${PRED_TONE[p.tone] ?? PRED_TONE.info}`}><I className="size-4" /></div>
              <div>
                <p className="text-[13px] font-semibold leading-snug text-foreground">{p.title}</p>
                <p className="text-[11px] text-muted-foreground">{p.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TimelineCard({ events, compact }: { events: VehicleIntelligence["timeline"]; compact?: boolean }) {
  const list = compact ? events.slice(0, 6) : events;
  return (
    <Card>
      <CardTitle right={compact ? <Link href="#" className="text-xs font-semibold text-primary">History →</Link> : undefined}>Timeline</CardTitle>
      <ol className="relative ml-1 border-l border-border">
        {list.map((e, i) => {
          const dot = e.type?.includes("service") ? "bg-green-500" : e.severity === "info" ? "bg-blue-500" : "bg-slate-300";
          return (
            <li key={i} className="mb-3.5 ml-4">
              <span className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${dot}`} />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground">{e.title}</p>
                {e.cost != null ? <span className="font-brand text-xs font-bold text-foreground">{money(e.cost)}</span> : null}
              </div>
              <p className="text-[11px] text-muted-foreground">{dateFmt(e.date)}{e.km ? ` · ${e.km.toLocaleString()} km` : ""}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function OwnerCard({ owner, commercial }: { owner: NonNullable<VehicleIntelligence["owner_context"]>; commercial: VehicleIntelligence["commercial"] }) {
  return (
    <Card>
      <CardTitle>Owner</CardTitle>
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white">
          {(owner.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
        <div>
          <p className="font-semibold text-foreground">{owner.name}</p>
          <p className="text-xs text-muted-foreground">{owner.vehicle_count} vehicles{owner.spend_tier ? ` · ${owner.spend_tier}` : ""}{commercial ? ` · ${commercial.label}` : ""}</p>
        </div>
      </div>
      {owner.id && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <OwnerLink href={`/customers/${owner.id}`} icon={<Car className="size-4" />} label="360" />
          <OwnerLink href="/billing" icon={<Receipt className="size-4" />} label="Billing" />
          <OwnerLink href="/inbox" icon={<MessageSquare className="size-4" />} label="Chat" />
        </div>
      )}
    </Card>
  );
}
function OwnerLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link href={href} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 py-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">{icon}{label}</Link>;
}

function PassportCard({ passport, vehicleId, large }: { passport: VehicleIntelligence["passport"]; vehicleId: string; large?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl" style={{ background: "linear-gradient(150deg,#12203b,#0B1220)" }}>
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(217,163,34,.25), transparent)" }} />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-brand text-[15px] font-extrabold">Certified Passport</h3>
        {passport.tier && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"><Star className="size-3" /> {passport.tier}</span>}
      </div>
      <div className="flex items-center gap-4">
        <div className="grid size-16 place-items-center rounded-xl bg-white text-slate-900"><ShieldCheck className="size-8" /></div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-[0.2em] text-slate-400">{passport.code}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {passport.highlights.filter((h) => h.ok).slice(0, 3).map((h) => (
              <span key={h.label} className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-slate-300">{h.label}</span>
            ))}
          </div>
          <Link href={`/passport/${vehicleId}`} target="_blank" className="mt-2 inline-block text-xs font-bold text-amber-300">Share &amp; download →</Link>
        </div>
      </div>
      {large && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-sm">
          <div><span className="text-slate-500">Compliance</span><div className="font-brand font-bold">{passport.compliance}%</div></div>
          <div><span className="text-slate-500">Services</span><div className="font-brand font-bold">{passport.vitals.services_completed}</div></div>
        </div>
      )}
    </div>
  );
}

function SpecsCard({ v }: { v: VehicleIntelligence["identity"] }) {
  const specs: [string, string | number | null][] = [
    ["Engine", v.engine], ["Transmission", v.transmission], ["Color", v.color],
    ["Year", v.year], ["VIN", v.vin ? `${v.vin.slice(0, 5)}…${v.vin.slice(-4)}` : null],
  ];
  return (
    <Card>
      <CardTitle>Specifications</CardTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {specs.filter(([, val]) => val).map(([k, val]) => (
          <div key={k} className="rounded-xl bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="font-brand mt-0.5 truncate text-sm font-bold text-foreground">{val}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MaintenanceCard({ items }: { items: VehicleIntelligence["maintenance"] }) {
  return (
    <Card>
      <CardTitle>Next Maintenance</CardTitle>
      {items.length === 0 ? (
        <div className="grid place-items-center py-8 text-center">
          <ShieldCheck className="size-7 text-green-500" />
          <p className="mt-2 text-sm font-medium text-foreground">All up to date</p>
          <p className="text-xs text-muted-foreground">No services due right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m, i) => {
            const when = m.remaining_days != null ? `${m.remaining_days} days` : m.remaining_km != null ? `${m.remaining_km.toLocaleString()} km` : "soon";
            const tone = m.status === "overdue" ? "text-red-600" : m.status === "due_soon" ? "text-amber-600" : "text-muted-foreground";
            return (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <Wrench className="size-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium text-foreground">{m.service_type}</span>
                <span className={`text-xs font-semibold ${tone}`}>{when}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
