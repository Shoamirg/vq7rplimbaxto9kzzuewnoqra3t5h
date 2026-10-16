"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Check, CheckCheck, Clock, MoreHorizontal, QrCode, User, Wrench, X } from "lucide-react";
import { Badge, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, AppointmentBilling, AppointmentStatus } from "@/lib/api/types";
import { durationLabel, eligible, type QueueAction } from "./queue-model";

export const QUEUE_GRID = "xl:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,1fr)] xl:min-w-[1120px]";
const LINK = "min-h-11 min-w-11 flex items-center rounded-md text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary break-words [overflow-wrap:anywhere]";
const STATUS_BADGE: Record<AppointmentStatus, "warning" | "info" | "primary" | "success" | "danger" | "neutral"> = {
  pending: "warning", confirmed: "info", in_progress: "primary", completed: "success", cancelled: "danger", rescheduled: "neutral",
};
const HEALTH_COLOR: Record<string, string> = {
  excellent: "text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950 dark:border-emerald-700",
  good: "text-lime-800 bg-lime-50 border-lime-200 dark:text-lime-200 dark:bg-lime-950 dark:border-lime-700",
  fair: "text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950 dark:border-amber-700",
  poor: "text-red-800 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-950 dark:border-red-700",
};
const STATUS_COLOR: Record<AppointmentStatus, string> = {
  pending: HEALTH_COLOR.fair, confirmed: "text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950 dark:border-sky-700",
  in_progress: "text-violet-800 bg-violet-50 border-violet-200 dark:text-violet-200 dark:bg-violet-950 dark:border-violet-700",
  completed: HEALTH_COLOR.excellent, cancelled: HEALTH_COLOR.poor,
  rescheduled: "text-foreground bg-muted border-border",
};
const BILLING_STATUSES = new Set(["draft", "sent", "viewed", "approved", "rejected", "changes_requested", "expired", "issued", "partial", "paid", "overdue", "void", "refunded"]);

export function QueueCheckbox({ label, checked, disabled, compact, onChange }: { label: string; checked: boolean; disabled?: boolean; compact?: boolean; onChange: () => void }) {
  return <label className={cn("min-h-11 min-w-11 inline-flex items-center justify-center gap-2 rounded-md px-2 text-sm focus-within:ring-2 focus-within:ring-primary", disabled ? "opacity-50" : "cursor-pointer hover:bg-muted")}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} className="size-4 shrink-0 accent-[hsl(var(--primary))]" />
    <span className={compact ? "sr-only" : "min-w-0 break-words"}>{label}</span>
  </label>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
    <p className="text-xs font-semibold text-muted-foreground xl:hidden">{label}</p>{children}
  </div>;
}

function Billing({ billing }: { billing?: AppointmentBilling | null }) {
  const { t, fmt } = useI18n();
  if (!billing) return <span className="text-sm text-muted-foreground">{t("queue.no_billing")}</span>;
  const status = BILLING_STATUSES.has(billing.status) ? t(`public.status_${billing.status}`) : t("queue.unknown");
  return <Link href="/billing" title={`${billing.code} · ${status}`} className={cn(LINK, "flex-col items-start justify-center rounded-md border border-border bg-muted/40 px-2 py-1 font-medium text-foreground")}>
    <span>{billing.kind === "estimate" ? `${t("work.estimate_short")} · ` : ""}{status}</span>
    <span className="tabular-nums">{fmt.money(billing.balance, billing.currency)}</span>
    <span className="text-xs text-muted-foreground">{billing.code}</span>
  </Link>;
}

export function QueueRow({ appointment: a, selected, busy, onToggle, onAct, onEdit, onInvoice, onNavigate }: {
  appointment: Appointment; selected: boolean; busy: boolean; onToggle: () => void;
  onAct: (id: string, action: QueueAction) => void; onEdit: (appointment: Appointment) => void;
  onInvoice: (appointment: Appointment) => void; onNavigate: (href: string) => void;
}) {
  const { t, fmt } = useI18n();
  const vehicle = a.vehicle_summary.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const score = a.health_score != null && Number.isFinite(a.health_score) ? fmt.number(Math.round(a.health_score)) : null;
  const band = a.health_band && HEALTH_COLOR[a.health_band] ? t(`band.${a.health_band}`) : t("queue.unknown");
  return <div role="listitem" data-testid={`appointment-row-${a.id}`} className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 items-start", QUEUE_GRID, selected ? "bg-primary/5" : "hover:bg-muted/30")}>
    <QueueCheckbox compact checked={selected} disabled={busy} onChange={onToggle} label={t("queue.select_row", { name: a.customer_name || t("queue.unknown") })} />
    <Field label={t("work.customer")}><Link href={`/customers/${a.customer_id}`} className={cn(LINK, "font-semibold text-foreground")}>{a.customer_name || t("queue.unknown")}</Link></Field>
    <Field label={t("work.vehicle")}><Link href={`/vehicles/${a.vehicle_id}`} className={cn(LINK, "flex-col items-start justify-center text-foreground")}>
      <span>{vehicle ? vehicle[1] : a.vehicle_summary || t("queue.unknown")}</span>{vehicle && <span className="font-mono text-xs text-muted-foreground">{vehicle[2]}</span>}
    </Link></Field>
    <Field label={t("work.service")}><p className="flex gap-1.5 text-sm text-foreground"><Wrench className="size-4 shrink-0 mt-0.5" />{a.service_type || t("common.general_service")}</p></Field>
    <Field label={t("work.when")}><p className="flex gap-1.5 text-sm text-foreground"><Clock className="size-4 shrink-0 mt-0.5" /><span>{fmt.date(a.appointment_local_date || a.appointment_date)} · {a.appointment_time}</span></p></Field>
    <Field label={t("work.mechanic")}><p className="flex gap-1.5 text-sm text-foreground"><User className="size-4 shrink-0 mt-0.5" />{a.mechanic_name || t("work.unassigned")}</p></Field>
    <Field label={t("work.health")}>{score ? <Link href={`/vehicles/${a.vehicle_id}`} title={t("queue.health_title", { score, band })} className={cn(LINK, "border px-2 py-1 font-semibold", HEALTH_COLOR[a.health_band || ""] || "text-foreground bg-muted border-border")}>
      {score} · {band}
    </Link> : <span className="text-sm text-muted-foreground">{t("queue.no_health")}</span>}</Field>
    <Field label={t("work.billing")}><Billing billing={a.billing} /></Field>
    <Field label={t("work.duration")}><p className="text-sm tabular-nums text-foreground">{durationLabel(a.estimated_duration_minutes, t, fmt.number)}</p></Field>
    <Field label={t("work.status")}><div className="flex flex-wrap items-center gap-2">
      <Badge variant={STATUS_BADGE[a.status]} className={STATUS_COLOR[a.status]} size="sm">{t(`status.${a.status}`)}</Badge>
      <DropdownMenu><DropdownMenuTrigger asChild>
        <button data-queue-actions disabled={busy} className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" aria-label={t("work.actions")}><MoreHorizontal className="size-4" /></button>
      </DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60 max-w-[calc(100vw-2rem)] [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:min-w-11" aria-label={t("work.actions")}>
        {eligible(a, "confirm") && <DropdownMenuItem disabled={busy} icon={<Check className="size-4" />} onSelect={() => onAct(a.id, "confirm")}>{t("work.confirm")}</DropdownMenuItem>}
        {eligible(a, "start") && <DropdownMenuItem disabled={busy} icon={<Wrench className="size-4" />} onSelect={() => onAct(a.id, "start")}>{t("work.start")}</DropdownMenuItem>}
        {eligible(a, "complete") && <DropdownMenuItem disabled={busy} icon={<CheckCheck className="size-4" />} onSelect={() => onAct(a.id, "complete")}>{t("work.complete")}</DropdownMenuItem>}
        {a.status === "completed" && <DropdownMenuItem disabled={busy} icon={<QrCode className="size-4" />} onSelect={() => onInvoice(a)}>{t("work.invoice_action")}</DropdownMenuItem>}
        {eligible(a, "cancel") && <DropdownMenuItem disabled={busy} icon={<X className="size-4" />} destructive onSelect={() => onAct(a.id, "cancel")}>{t("work.cancel")}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<User className="size-4" />} onSelect={() => onNavigate(`/customers/${a.customer_id}`)}>{t("work.open_customer")}</DropdownMenuItem>
        <DropdownMenuItem icon={<Wrench className="size-4" />} onSelect={() => onNavigate(`/vehicles/${a.vehicle_id}`)}>{t("work.open_vehicle")}</DropdownMenuItem>
        <DropdownMenuItem icon={<QrCode className="size-4" />} onSelect={() => window.open(`/passport/${a.vehicle_id}`, "_blank", "noopener,noreferrer")}>{t("work.open_passport")}</DropdownMenuItem>
        {eligible(a, "cancel") && <><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} onSelect={() => onEdit(a)}>{t("work.edit")}</DropdownMenuItem></>}
      </DropdownMenuContent></DropdownMenu>
    </div></Field>
  </div>;
}
