"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, Send, Car, Clock, DollarSign, CalendarClock, ShieldAlert,
  QrCode, Wrench, Sparkles, Star, MapPin, MessageSquare, FileText, StickyNote,
  Gauge, ArrowRight, Receipt, Trash2,
} from "lucide-react";
import { Badge, Button, cn, useToast } from "@garageos/design-system";

import { HealthGauge } from "@/components/vehicles/health-gauge";
import { EmptyState } from "@/components/states/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";
import { AddVehicleModal } from "@/components/vehicles/add-vehicle-modal";
import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import type { Customer360, HealthBand } from "@/lib/api/types";

const BAND_TEXT: Record<HealthBand, string> = {
  excellent: "text-emerald-600", good: "text-green-600", fair: "text-amber-600", poor: "text-red-600",
};

const TL_SEVERITY: Record<string, string> = {
  critical: "bg-red-600", high: "bg-red-500", medium: "bg-amber-500", low: "bg-blue-500", info: "bg-slate-400",
};

const TABS = [
  "Overview", "Financial", "Vehicles", "Passports", "Timeline", "Appointments",
  "Messages", "Emergency", "Documents", "Notes",
] as const;
type Tab = (typeof TABS)[number];

const CH_TONE: Record<string, string> = {
  excellent: "text-emerald-600 bg-emerald-50 border-emerald-200",
  good: "text-lime-600 bg-lime-50 border-lime-200",
  fair: "text-amber-600 bg-amber-50 border-amber-200",
  poor: "text-red-600 bg-red-50 border-red-200",
  new: "text-slate-500 bg-slate-100 border-slate-200",
};

// Number/money/date formatters bound to the active UI language.
function useFmt() {
  const { locale } = useI18n();
  return {
    nf: (n: number) => formatNumber(locale, n),
    money: (n: number) => `$${formatNumber(locale, Math.round(n))}`,
    fmtDate: (iso: string | null) =>
      iso ? formatDate(locale, iso, { day: "numeric", month: "short", year: "numeric" }) : "—",
  };
}
const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function CustomerScreen({ customer }: { customer: Customer360 }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [del, setDel] = useState(false);
  const [book, setBook] = useState(false);
  const [addVeh, setAddVeh] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { money } = useFmt();
  const c = customer;
  const since = c.since ? new Date(c.since).getFullYear() : null;

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground">← {t("cust.back")}</Link>

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
              {c.financial && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", CH_TONE[c.financial.commercial_health.band] ?? CH_TONE.new)}
                  title={t("cust.header.ch_title", { score: c.financial.commercial_health.score, risk: c.financial.commercial_health.risk })}>
                  {"★".repeat(c.financial.commercial_health.stars)}{"☆".repeat(Math.max(0, 5 - c.financial.commercial_health.stars))} {c.financial.commercial_health.label}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {since ? t("cust.header.since", { year: since }) : t("cust.header.customer")}
              {c.address ? ` · ${c.address}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" leftIcon={<CalendarClock className="size-4" />} onClick={() => setBook(true)}>{t("cust.action.book")}</Button>
            <Button variant="outline" size="sm" leftIcon={<Car className="size-4" />} onClick={() => setAddVeh(true)}>{t("cust.action.add_vehicle")}</Button>
            {c.phone && <Button variant="outline" size="sm" leftIcon={<Phone className="size-4" />}>{t("cust.action.call")}</Button>}
            {c.email && <Button variant="outline" size="sm" leftIcon={<Mail className="size-4" />}>{t("cust.action.email")}</Button>}
            {c.has_telegram && <Button variant="outline" size="sm" leftIcon={<Send className="size-4" />}>{t("cust.action.telegram")}</Button>}
            <Button variant="outline" size="sm" leftIcon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>{t("common.delete")}</Button>
          </div>
        </div>

        {book && (
          <NewAppointmentModal
            preset={{ id: customer.id, name: c.full_name }}
            onClose={() => setBook(false)}
            onCreated={() => { setBook(false); router.refresh(); }}
          />
        )}

        {addVeh && (
          <AddVehicleModal
            customerId={customer.id}
            onClose={() => setAddVeh(false)}
            onAdded={() => { setAddVeh(false); router.refresh(); }}
          />
        )}

        {del && (
          <ConfirmDialog
            title={t("cust.delete.title")}
            message={t("cust.delete.message", { name: c.full_name })}
            confirmLabel={t("cust.delete.confirm")}
            onClose={() => setDel(false)}
            onConfirm={async () => {
              try {
                await clientFetch(`/customers/${customer.id}`, { method: "DELETE" });
                toast({ title: t("cust.toast.deleted_title"), description: c.full_name, variant: "success" });
                router.push("/customers");
              } catch {
                setDel(false);
                toast({ title: t("cust.toast.delete_failed_title"), description: t("cust.toast.try_again"), variant: "danger" });
              }
            }}
          />
        )}

        {/* Stat strip — business signals up front */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat icon={DollarSign} label={t("cust.stat.lifetime_value")} value={money(c.stats.lifetime_value)} />
          <Stat icon={FileText} label={t("cust.stat.outstanding")} value={money(c.stats.outstanding)} valueClass={c.stats.outstanding > 0 ? "text-red-600" : undefined} />
          <Stat icon={Receipt} label={t("cust.stat.invoices")} value={String(c.financial?.invoice_count ?? 0)} />
          <Stat icon={Clock} label={t("cust.stat.avg_days_to_pay")} value={c.financial?.avg_days_to_pay != null ? `${c.financial.avg_days_to_pay}` : "—"} />
          <Stat icon={Car} label={t("cust.stat.vehicles")} value={String(c.stats.vehicle_count)} />
          <Stat icon={Gauge} label={t("cust.stat.avg_health")} value={`${c.stats.health_avg}`} valueClass={BAND_TEXT[c.stats.health_band]} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={cn(
              "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === tabName ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`cust.tab.${tabName.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview customer={c} />}
      {tab === "Financial" && <Financial customer={c} />}
      {tab === "Vehicles" && <Vehicles customer={c} />}
      {tab === "Passports" && <Passports customer={c} />}
      {tab === "Timeline" && <Timeline customer={c} />}
      {tab === "Appointments" && <Appointments customer={c} />}
      {tab === "Messages" && <Placeholder icon={MessageSquare} title={t("cust.ph.messages_title")} body={t("cust.ph.messages_body")} />}
      {tab === "Emergency" && <Placeholder icon={ShieldAlert} title={t("cust.ph.emergency_title")} body={t("cust.ph.emergency_body")} />}
      {tab === "Documents" && <Placeholder icon={FileText} title={t("cust.ph.documents_title")} body={t("cust.ph.documents_body")} />}
      {tab === "Notes" && <Placeholder icon={StickyNote} title={t("cust.ph.notes_title")} body={t("cust.ph.notes_body")} />}
    </div>
  );
}

function Financial({ customer: c }: { customer: Customer360 }) {
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  const f = c.financial;
  if (!f) return <Placeholder icon={Receipt} title={t("cust.fin.empty_title")} body={t("cust.fin.empty_body")} />;
  const ch = f.commercial_health;
  const kpis = [
    { label: t("cust.fin.lifetime_spend"), value: money(f.lifetime_spend) },
    { label: t("cust.stat.outstanding"), value: money(f.outstanding), tone: f.outstanding > 0 ? "text-red-600" : undefined },
    { label: t("cust.fin.overdue"), value: `${money(f.overdue_amount)}${f.overdue_count ? ` · ${f.overdue_count}` : ""}`, tone: f.overdue_amount > 0 ? "text-red-600" : undefined },
    { label: t("cust.stat.avg_days_to_pay"), value: f.avg_days_to_pay != null ? `${f.avg_days_to_pay}` : "—" },
    { label: t("cust.fin.preferred_method"), value: f.preferred_method ? f.preferred_method.replace("_", " ") : "—" },
    { label: t("cust.fin.approval_rate"), value: f.approval_rate != null ? `${Math.round(f.approval_rate * 100)}%` : "—" },
    { label: t("cust.fin.open_estimates"), value: String(f.open_estimate_count) },
    { label: t("cust.fin.last_payment"), value: f.last_payment ? `${money(f.last_payment.amount)} · ${fmtDate(f.last_payment.date)}` : "—" },
  ];
  return (
    <div className="space-y-5">
      {/* Commercial Health — the money equivalent of Vehicle Health */}
      <div className={cn("rounded-2xl border p-5 flex items-center gap-5", CH_TONE[ch.band] ?? CH_TONE.new)}>
        <div className="text-center shrink-0">
          <div className="text-3xl font-extrabold tabular-nums">{ch.score}</div>
          <div className="text-lg leading-none">{"★".repeat(ch.stars)}{"☆".repeat(Math.max(0, 5 - ch.stars))}</div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide font-bold opacity-70">{t("cust.fin.commercial_health")}</p>
          <p className="text-xl font-extrabold">{ch.label}</p>
          <p className="text-sm opacity-80">{t("cust.fin.risk")}: <span className="font-semibold capitalize">{ch.risk}</span> · {f.invoice_count} {t("cust.fin.invoices")} · {t("cust.fin.avg_pay")} {f.avg_days_to_pay ?? "—"} {t("cust.fin.days")}</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={cn("text-sm font-bold text-foreground mt-0.5 truncate", k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DocList title={t("cust.stat.invoices")} rows={f.invoices} />
        <DocList title={t("cust.fin.estimates")} rows={f.estimates} />
        <PayList rows={f.payments} />
      </div>
    </div>
  );
}

function DocList({ title, rows }: { title: string; rows: any[] }) {
  const { t } = useI18n();
  const { money } = useFmt();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm font-bold">{title}</span>
        <Link href="/billing" className="text-xs text-primary hover:underline">{t("cust.fin.open")} →</Link>
      </div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("cust.fin.none_yet")}</p> : (
        <div className="divide-y divide-border">
          {rows.slice(0, 6).map((d: any) => (
            <Link key={d.id} href="/billing" className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40">
              <span className="font-mono text-[11px] text-muted-foreground">{d.code}</span>
              <span className="ml-auto text-sm font-mono font-bold">{money(d.total)}</span>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded capitalize",
                d.status === "paid" ? "text-emerald-600 bg-emerald-50" : d.status === "overdue" ? "text-red-600 bg-red-50" :
                d.status === "partial" ? "text-amber-600 bg-amber-50" : d.status === "approved" ? "text-emerald-600 bg-emerald-50" :
                "text-blue-600 bg-blue-50")}>{d.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PayList({ rows }: { rows: any[] }) {
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border"><span className="text-sm font-bold">{t("cust.fin.payments")}</span></div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("cust.fin.none_yet")}</p> : (
        <div className="divide-y divide-border">
          {rows.slice(0, 6).map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="capitalize">{p.method.replace("_", " ")}</span>
              <span className="text-[11px] text-muted-foreground">{fmtDate(p.received_at)}</span>
              <span className={cn("ml-auto font-mono font-bold", p.kind === "refund" && "text-red-600")}>{p.kind === "refund" ? "−" : ""}{money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
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
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  const answers = [
    { icon: Car, label: t("cust.stat.vehicles"), value: t("cust.ov.on_file", { count: c.stats.vehicle_count }) },
    { icon: Gauge, label: t("cust.ov.fleet_health"), value: `${c.stats.health_avg} · ${c.stats.health_band}` },
    { icon: CalendarClock, label: t("cust.ov.next_booking"), value: c.stats.next_booking ? fmtDate(c.stats.next_booking) : t("cust.ov.none_scheduled") },
    { icon: Clock, label: t("cust.card.last_visit"), value: fmtDate(c.stats.last_visit) },
    { icon: DollarSign, label: t("cust.stat.outstanding"), value: c.stats.outstanding > 0 ? money(c.stats.outstanding) : t("cust.ov.none") },
    { icon: ShieldAlert, label: t("cust.ov.emergencies"), value: c.stats.emergency_count > 0 ? String(c.stats.emergency_count) : t("cust.ov.none") },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("cust.ov.at_a_glance")}</h3>
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
          <span className="text-xs font-semibold uppercase tracking-wide">{t("cust.ov.ai_summary")}</span>
          <Badge variant="primary" size="sm">{t("cust.ov.beta")}</Badge>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{c.ai_summary}</p>
      </div>
    </div>
  );
}

function VehicleCards({ customer: c }: { customer: Customer360 }) {
  const { t } = useI18n();
  const { nf } = useFmt();
  if (c.vehicles.length === 0) {
    return <EmptyState compact icon={Car} title={t("cust.veh.empty_title")} description={t("cust.veh.empty_desc")} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {c.vehicles.map((v) => (
        <div key={v.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <HealthGauge score={v.score} band={v.band} size={72} stroke={7} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{v.label}</p>
            <p className="text-xs text-muted-foreground">{v.year} · {nf(v.current_km)} {t("cust.veh.km")}</p>
            <div className="flex items-center gap-3 mt-2">
              <Link href={`/vehicles/${v.id}`} className="text-xs text-primary hover:underline flex items-center gap-1"><Wrench className="size-3" /> {t("cust.veh.health")}</Link>
              <Link href={`/passport/${v.id}`} target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1"><QrCode className="size-3" /> {t("cust.veh.passport")}</Link>
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
  const { t } = useI18n();
  if (c.vehicles.length === 0) return <Placeholder icon={QrCode} title={t("cust.pass.empty_title")} body={t("cust.pass.empty_body")} />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {c.vehicles.map((v) => (
        <Link key={v.id} href={`/passport/${v.id}`} target="_blank"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><QrCode className="size-3.5" /> {t("cust.pass.verified")}</span>
            <span className={cn("text-lg font-bold", BAND_TEXT[v.band])}>{Math.round(v.score)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground truncate">{v.label}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.passport_code}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary group-hover:gap-2 transition-all">
            {t("cust.pass.open")} <ArrowRight className="size-3" />
          </span>
        </Link>
      ))}
    </div>
  );
}

function Timeline({ customer: c }: { customer: Customer360 }) {
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  if (c.timeline.length === 0) return <Placeholder icon={Clock} title={t("cust.tl.empty_title")} body={t("cust.tl.empty_body")} />;
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
  const { t } = useI18n();
  const { money, fmtDate } = useFmt();
  if (c.appointments.length === 0) return <Placeholder icon={CalendarClock} title={t("cust.appt.empty_title")} body={t("cust.appt.empty_body")} />;
  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {c.appointments.map((a) => (
        <div key={a.id} className="flex items-center gap-4 p-4">
          <div className="text-center min-w-[64px]">
            <p className="text-xs font-medium text-foreground">{fmtDate(a.date)}</p>
            <p className="text-[11px] text-muted-foreground">{a.time}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{a.mechanic_name ?? t("cust.appt.unassigned")}</p>
            <p className="text-xs text-muted-foreground">{a.duration} {t("cust.appt.min")}{a.total_cost != null ? ` · ${money(a.total_cost)}` : ""}</p>
          </div>
          <Badge variant={(APPT_VARIANT[a.status] ?? "neutral") as never} size="sm">{t(`status.${a.status}`)}</Badge>
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
