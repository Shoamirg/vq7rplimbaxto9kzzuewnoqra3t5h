"use client";
import { CustomerAccount } from "./customer-account";
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
import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
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

function useCustomerText() {
  const { t, fmt } = useI18n();
  const text = (value: string) => t("customer.text." + value);
  const money = (n: number, currency = "USD") => fmt.money(n, currency);
  const fmtDate = (iso: string | null) => iso ? fmt.date(iso) : "—";
  const amounts = (values?: Record<string, number>, fallback = 0) => {
    const rows = Object.entries(values ?? { USD: fallback });
    const nonzero = rows.filter(([, value]) => value !== 0);
    return (nonzero.length ? nonzero : rows.slice(0, 1)).map(([currency, value]) => money(value, currency)).join(" · ") || money(0, "UZS");
  };
  return { t, fmt, text, money, fmtDate, amounts, nf: fmt.number };
}
const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function CustomerScreen({ customer, canManageAccount = false }: { customer: Customer360; canManageAccount?: boolean }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  const [tab, setTab] = useState<Tab>("Overview");
  const [del, setDel] = useState(false);
  const [book, setBook] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const c = customer;
  const since = c.since ? new Date(c.since).getFullYear() : null;

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground">← {text("Customers")}</Link>

      {canManageAccount && <CustomerAccount customerId={c.id} />}
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
                  <Star className="size-3 fill-current" /> {t("customer.tier." + c.tier.label)}
                </span>
              )}
              {c.financial && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", CH_TONE[c.financial.commercial_health.band] ?? CH_TONE.new)}
                  title={t("customer.health_hint", { score: c.financial.commercial_health.score, risk: t("customer.risk." + c.financial.commercial_health.risk) })}>
                  {"★".repeat(c.financial.commercial_health.stars)}{"☆".repeat(Math.max(0, 5 - c.financial.commercial_health.stars))} {t("customer.health." + c.financial.commercial_health.band)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {since ? t("customer.since", { year: since }) : text("Customer")}
              {c.address ? ` · ${c.address}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" leftIcon={<CalendarClock className="size-4" />} onClick={() => setBook(true)}>{text("Book")}</Button>
            {c.phone && <a href={"tel:" + c.phone} className="text-sm text-primary inline-flex gap-1 items-center"><Phone className="size-4" />{text("Call")}</a>}
            {c.email && <a href={"mailto:" + c.email} className="text-sm text-primary inline-flex gap-1 items-center"><Mail className="size-4" />{text("Email")}</a>}

            <Button variant="outline" size="sm" leftIcon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>{text("Delete")}</Button>
          </div>
        </div>

        {book && (
          <NewAppointmentModal
            preset={{ id: customer.id, name: c.full_name }}
            onClose={() => setBook(false)}
            onCreated={() => { setBook(false); router.refresh(); }}
          />
        )}

        {del && (
          <ConfirmDialog
            title={text("Delete this customer?")}
            message={t("customer.delete_message", { name: c.full_name })}
            confirmLabel={text("Delete customer")}
            onClose={() => setDel(false)}
            onConfirm={async () => {
              try {
                await clientFetch(`/customers/${customer.id}`, { method: "DELETE" });
                toast({ title: text("Customer deleted"), description: c.full_name, variant: "success" });
                router.push("/customers");
              } catch {
                setDel(false);
                toast({ title: text("Delete failed"), description: text("Please try again."), variant: "danger" });
              }
            }}
          />
        )}

        {/* Stat strip — business signals up front */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat icon={DollarSign} label={text("Lifetime value")} value={amounts(c.stats.lifetime_value_by_currency, c.stats.lifetime_value)} />
          <Stat icon={FileText} label={text("Outstanding")} value={amounts(c.stats.outstanding_by_currency, c.stats.outstanding)} valueClass={Object.values(c.stats.outstanding_by_currency ?? { USD: c.stats.outstanding }).some((n) => n > 0) ? "text-red-600" : undefined} />
          <Stat icon={Receipt} label={text("Invoices")} value={String(c.financial?.invoice_count ?? 0)} />
          <Stat icon={Clock} label={text("Avg days to pay")} value={c.financial?.avg_days_to_pay != null ? `${c.financial.avg_days_to_pay}` : "—"} />
          <Stat icon={Car} label={text("Vehicles")} value={String(c.stats.vehicle_count)} />
          <Stat icon={Gauge} label={text("Avg health")} value={nf(c.stats.health_avg)} valueClass={BAND_TEXT[c.stats.health_band]} />
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
            {text(t)}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview customer={c} />}
      {tab === "Financial" && <Financial customer={c} />}
      {tab === "Vehicles" && <Vehicles customer={c} />}
      {tab === "Passports" && <Passports customer={c} />}
      {tab === "Timeline" && <Timeline customer={c} />}
      {tab === "Appointments" && <Appointments customer={c} />}
      {tab === "Messages" && <Placeholder icon={MessageSquare} title={text("Conversations arrive with the Support Center")} body={text("Telegram, chat, voice notes, and emergency threads will unify here as one conversation tied to this customer.")} />}
      {tab === "Emergency" && <Placeholder icon={ShieldAlert} title={text("Emergency history arrives with the Emergency Center")} body={text("Roadside cases, tow dispatches, live location, and photos will appear here, linked to this customer's timeline.")} />}
      {tab === "Documents" && <Placeholder icon={FileText} title={text("No documents yet")} body={text("Inspection reports, warranties, and uploads will be stored here per customer.")} />}
      {tab === "Notes" && <Placeholder icon={StickyNote} title={text("No notes yet")} body={text("Staff notes and preferences for this customer will be captured here.")} />}
    </div>
  );
}

function Financial({ customer: c }: { customer: Customer360 }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  const f = c.financial;
  if (!f) return <Placeholder icon={Receipt} title={text("No financial data yet")} body={text("Estimates, invoices, and payments will appear here.")} />;
  const ch = f.commercial_health;
  const kpis = [
    { label: text("Lifetime spend"), value: amounts(Object.fromEntries(Object.entries(f.by_currency ?? {}).map(([currency, v]) => [currency, v.lifetime_spend])), f.lifetime_spend) },
    { label: text("Outstanding"), value: amounts(Object.fromEntries(Object.entries(f.by_currency ?? {}).map(([currency, v]) => [currency, v.outstanding])), f.outstanding), tone: Object.values(f.by_currency ?? {}).some((v) => v.outstanding > 0) ? "text-red-600" : undefined },
    { label: text("Overdue"), value: `${amounts(Object.fromEntries(Object.entries(f.by_currency ?? {}).map(([currency, v]) => [currency, v.overdue_amount])), f.overdue_amount)}${f.overdue_count ? ` · ${f.overdue_count}` : ""}`, tone: Object.values(f.by_currency ?? {}).some((v) => v.overdue_amount > 0) ? "text-red-600" : undefined },
    { label: text("Avg days to pay"), value: f.avg_days_to_pay != null ? `${f.avg_days_to_pay}` : "—" },
    { label: text("Preferred method"), value: f.preferred_method ? t("billing.method_" + (f.preferred_method === "bank_transfer" ? "bank" : f.preferred_method)) : "—" },
    { label: text("Approval rate"), value: f.approval_rate != null ? `${Math.round(f.approval_rate * 100)}%` : "—" },
    { label: text("Open estimates"), value: String(f.open_estimate_count) },
    { label: text("Last payment"), value: f.last_payment ? `${money(f.last_payment.amount, f.last_payment.currency)} · ${fmtDate(f.last_payment.date)}` : "—" },
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
          <p className="text-[11px] uppercase tracking-wide font-bold opacity-70">{text("Commercial Health")}</p>
          <p className="text-xl font-extrabold">{t("customer.health." + ch.band)}</p>
          <p className="text-sm opacity-80">{t("customer.payment_summary", { risk: t("customer.risk." + ch.risk), count: f.invoice_count, days: f.avg_days_to_pay ?? "—" })}</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={cn("text-sm font-bold text-foreground mt-0.5 break-words", k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DocList title={text("Invoices")} rows={f.invoices} />
        <DocList title={text("Estimates")} rows={f.estimates} />
        <PayList rows={f.payments} />
      </div>
    </div>
  );
}

function DocList({ title, rows }: { title: string; rows: any[] }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm font-bold">{title}</span>
        <Link href="/billing" className="text-xs text-primary hover:underline">{text("Open →")}</Link>
      </div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{text("None yet.")}</p> : (
        <div className="divide-y divide-border">
          {rows.slice(0, 6).map((d: any) => (
            <Link key={d.id} href="/billing" className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40">
              <span className="font-mono text-[11px] text-muted-foreground">{d.code}</span>
              <span className="ml-auto text-sm font-mono font-bold">{money(d.total, d.currency ?? "USD")}</span>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded capitalize",
                d.status === "paid" ? "text-emerald-600 bg-emerald-50" : d.status === "overdue" ? "text-red-600 bg-red-50" :
                d.status === "partial" ? "text-amber-600 bg-amber-50" : d.status === "approved" ? "text-emerald-600 bg-emerald-50" :
                "text-blue-600 bg-blue-50")}>{t("public.status_" + d.status)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PayList({ rows }: { rows: any[] }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border"><span className="text-sm font-bold">{text("Payments")}</span></div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{text("None yet.")}</p> : (
        <div className="divide-y divide-border">
          {rows.slice(0, 6).map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="capitalize">{t("billing.method_" + (p.method === "bank_transfer" ? "bank" : p.method))}</span>
              <span className="text-[11px] text-muted-foreground">{fmtDate(p.received_at)}</span>
              <span className={cn("ml-auto font-mono font-bold", p.kind === "refund" && "text-red-600")}>{p.kind === "refund" ? "−" : ""}{money(p.amount, p.currency ?? "USD")}</span>
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
        <p className={cn("text-sm font-semibold text-foreground break-words", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function Overview({ customer: c }: { customer: Customer360 }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  const answers = [
    { icon: Car, label: text("Vehicles"), value: t("customer.on_file", { count: c.stats.vehicle_count }) },
    { icon: Gauge, label: text("Fleet health"), value: `${nf(c.stats.health_avg)} · ${t("band." + c.stats.health_band)}` },
    { icon: CalendarClock, label: text("Next booking"), value: c.stats.next_booking ? fmtDate(c.stats.next_booking) : text("None scheduled") },
    { icon: Clock, label: text("Last visit"), value: fmtDate(c.stats.last_visit) },
    { icon: DollarSign, label: text("Outstanding"), value: Object.values(c.stats.outstanding_by_currency ?? { USD: c.stats.outstanding }).some((n) => n > 0) ? amounts(c.stats.outstanding_by_currency, c.stats.outstanding) : text("None") },
    { icon: ShieldAlert, label: text("Emergencies"), value: c.stats.emergency_count > 0 ? String(c.stats.emergency_count) : text("None") },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">{text("At a glance")}</h3>
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
          <span className="text-xs font-semibold uppercase tracking-wide">{text("AI Summary")}</span>
          <Badge variant="primary" size="sm">{text("Beta")}</Badge>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{t("customer.summary", { name: c.full_name, count: c.vehicles.length, attention: c.vehicles.filter((v) => v.band === "poor").length })} {t(c.stats.next_booking ? "customer.booking_yes" : "customer.booking_no")}</p>
      </div>
    </div>
  );
}

function VehicleCards({ customer: c }: { customer: Customer360 }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  if (c.vehicles.length === 0) {
    return <EmptyState compact icon={Car} title={text("No vehicles on file")} description={text("Add a vehicle to start tracking its health and passport.")} />;
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
              <Link href={`/vehicles/${v.id}`} className="text-xs text-primary hover:underline flex items-center gap-1"><Wrench className="size-3" /> {text("Health")}</Link>
              <Link href={`/passport/${v.id}`} target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1"><QrCode className="size-3" /> {text("Passport")}</Link>
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
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  if (c.vehicles.length === 0) return <Placeholder icon={QrCode} title={text("No passports yet")} body={text("Each vehicle gets a certified passport once it's on file.")} />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {c.vehicles.map((v) => (
        <Link key={v.id} href={`/passport/${v.id}`} target="_blank"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><QrCode className="size-3.5" /> {text("Verified")}</span>
            <span className={cn("text-lg font-bold", BAND_TEXT[v.band])}>{Math.round(v.score)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground truncate">{v.label}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.passport_code}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary group-hover:gap-2 transition-all">
            {text("Open passport")} <ArrowRight className="size-3" />
          </span>
        </Link>
      ))}
    </div>
  );
}

function Timeline({ customer: c }: { customer: Customer360 }) {
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  if (c.timeline.length === 0) return <Placeholder icon={Clock} title={text("No history yet")} body={text("Services, appointments, and messages will appear here as one continuous history.")} />;
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
                  <p className="text-sm font-medium text-foreground">{e.type.startsWith("appointment_") ? t("customer.appointment_event", { status: t("status." + e.type.replace("appointment_", "")) }) : e.title}</p>
                  {e.detail && <p className="text-xs text-muted-foreground truncate">{e.detail}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>
                  {e.cost != null && <p className="text-xs font-medium text-foreground">{money(e.cost, e.currency ?? "USD")}</p>}
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
  const { t, fmt, text, money, fmtDate, amounts, nf } = useCustomerText();
  if (c.appointments.length === 0) return <Placeholder icon={CalendarClock} title={text("No appointments")} body={text("This customer has no appointment history yet.")} />;
  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {c.appointments.map((a) => (
        <div key={a.id} className="flex items-center gap-4 p-4">
          <div className="text-center min-w-[64px]">
            <p className="text-xs font-medium text-foreground">{fmtDate(a.date)}</p>
            <p className="text-[11px] text-muted-foreground">{a.time}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{a.mechanic_name ?? text("Unassigned")}</p>
            <p className="text-xs text-muted-foreground">{t("customer.minutes", { count: a.duration })}{a.total_cost != null ? ` · ${money(a.total_cost, a.currency ?? "USD")}` : ""}</p>
          </div>
          <Badge variant={(APPT_VARIANT[a.status] ?? "neutral") as never} size="sm">{t("status." + a.status)}</Badge>
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
