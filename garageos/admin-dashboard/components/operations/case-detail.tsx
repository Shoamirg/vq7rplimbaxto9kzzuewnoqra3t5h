"use client";

import Link from "next/link";
import {
  Phone, MapPin, Truck, Megaphone, UserPlus, CheckCircle2, Navigation,
  MessageSquare, Sparkles, Wrench, QrCode, ArrowUpRight, Check,
} from "lucide-react";
import { Badge, Button, cn } from "@garageos/design-system";

import { HealthGauge } from "@/components/vehicles/health-gauge";
import { useI18n } from "@/lib/i18n/context";
import type { CaseDetail, CaseMechanic, CaseSeverity } from "@/lib/api/types";
import { STEPS, STATUS_LABEL, NEXT_STATUS, TYPE_ICON, fmtTimer, relTime } from "./shared";

const TL_DOT: Record<CaseSeverity, string> = {
  critical: "bg-red-600", high: "bg-red-500", medium: "bg-amber-500", low: "bg-slate-400",
};
const SEV_BADGE: Record<CaseSeverity, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger", high: "warning", medium: "info", low: "neutral",
};

export function CaseDetailPanel({
  detail, mechanics, now, onAssign, onStatus,
}: {
  detail: CaseDetail;
  mechanics: CaseMechanic[];
  now: number;
  onAssign: (id: string) => void;
  onStatus: (s: string) => void;
}) {
  const { t } = useI18n();
  const d = detail;
  const elapsed = Math.max(0, Math.floor((now - new Date(d.created_at).getTime()) / 1000));
  const target = d.sla_response_minutes * 60;
  const pct = Math.min(100, (elapsed / target) * 100);
  const curStep = STEPS.findIndex((s) => s.key === d.status);
  const stepIdx = curStep === -1 ? (d.is_open ? 0 : STEPS.length - 1) : curStep;
  const next = NEXT_STATUS[d.status] ?? [];
  // Real shared location (roadside): the customer's GPS pin becomes a tappable
  // Google Maps link so the dispatcher can navigate to them.
  const mapsUrl =
    d.location_lat != null && d.location_lng != null
      ? `https://www.google.com/maps?q=${d.location_lat},${d.location_lng}`
      : null;
  const coordText =
    d.location_lat != null && d.location_lng != null
      ? `${d.location_lat.toFixed(5)}, ${d.location_lng.toFixed(5)}`
      : null;

  const reassure = [
    { label: t("ops.reassure.customer_informed"), ok: d.status !== "new" },
    { label: t("ops.reassure.technician_assigned"), ok: !!d.assigned_mechanic },
    { label: t("ops.reassure.eta_shared"), ok: ["en_route", "in_progress", "resolved", "closed"].includes(d.status) },
    { label: d.status === "resolved" || d.status === "closed" ? t("ops.reassure.resolved") : t("ops.reassure.awaiting_arrival"), ok: d.status === "resolved" || d.status === "closed" },
  ];

  return (
    <div className="p-4 lg:p-5 space-y-3.5">
      {/* Header + stepper */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-muted text-2xl">{TYPE_ICON[d.case_type]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {t("ops.case_label")} <span className="font-mono font-semibold text-foreground">{d.code}</span> ·{" "}
              <Badge variant={SEV_BADGE[d.severity]} size="sm">{d.case_type}</Badge>
            </p>
            <h1 className="text-lg font-bold text-foreground mt-0.5 truncate">{d.title}</h1>
            <span className="text-xs text-muted-foreground">{t("ops.status_label")}: {STATUS_LABEL[d.status]}{d.channel ? ` · ${t("ops.via")} ${d.channel}` : ""}</span>
          </div>
          {d.is_open && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("ops.sla_response")}</p>
              <p className={cn("text-2xl font-extrabold font-mono", pct > 85 ? "text-red-600" : pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                {fmtTimer(elapsed)} <span className="text-xs text-muted-foreground">/ {d.sla_response_minutes}:00</span>
              </p>
              {d.sla_breached && <p className="text-[11px] font-semibold text-red-600">{t("ops.sla_breached")}</p>}
            </div>
          )}
        </div>
        {/* Stepper */}
        <div className="flex items-center mt-4">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && <span className={cn("absolute top-3 right-1/2 w-full h-0.5 -z-0", i <= stepIdx ? "bg-emerald-500" : "bg-border")} />}
              <span className={cn("relative z-10 grid size-6 place-items-center rounded-full text-[10px] font-bold border-2",
                i < stepIdx ? "bg-emerald-500 border-emerald-500 text-white"
                  : i === stepIdx ? "bg-amber-500 border-amber-500 text-white ring-4 ring-amber-500/20"
                    : "bg-card border-border text-muted-foreground")}>
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className={cn("text-[10px] mt-1 font-medium", i === stepIdx ? "text-amber-600" : "text-muted-foreground")}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Escalation + status actions */}
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <Button key={s} size="sm" variant={s === "resolved" ? "success" : "primary"}
            leftIcon={s === "resolved" ? <CheckCircle2 className="size-4" /> : undefined}
            onClick={() => onStatus(s)}>
            {s === "en_route" ? t("ops.mark_en_route") : s === "resolved" ? t("ops.mark_resolved") : `→ ${STATUS_LABEL[s]}`}
          </Button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="outline" leftIcon={<Truck className="size-4" />}>{t("ops.request_tow")}</Button>
        <Button size="sm" variant="outline" leftIcon={<Megaphone className="size-4" />}>{t("ops.notify_manager")}</Button>
        <Button size="sm" variant="danger" leftIcon={<Phone className="size-4" />}>{t("ops.emergency_services")}</Button>
      </div>

      {/* Map hero + technician/dispatch */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3.5">
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="relative h-[280px]"
            style={{ background: "linear-gradient(0deg,rgba(37,99,235,.05),rgba(37,99,235,.05)),repeating-linear-gradient(0deg,#eef1f5 0 1px,transparent 1px 30px),repeating-linear-gradient(90deg,#eef1f5 0 1px,transparent 1px 30px),#F4F6F9" }}>
            <span className="absolute" style={{ left: "56%", top: "46%", transform: "translate(-50%,-50%)" }}>
              <span className="block size-4 rounded-full bg-red-600 border-[3px] border-white shadow-[0_0_0_8px_rgba(220,38,38,.2)]" />
            </span>
            <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm min-w-0">
                <MapPin className="size-3.5 text-red-500 shrink-0" />
                <span className="font-medium truncate">{d.location_text ?? coordText ?? t("ops.location_pending")}</span>
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 shrink-0">
                  <Navigation className="size-3.5" /> {t("ops.open_in_maps")}
                </a>
              )}
            </div>
            {d.assigned_mechanic && (
              <div className="absolute right-3 top-3 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">
                {d.assigned_mechanic.split(" ")[0]} · {t("ops.en_route")}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {d.assigned_mechanic ? (
            <div className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-slate-800 text-white text-xs font-bold">
                  {d.assigned_mechanic.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <div className="flex-1"><p className="text-sm font-bold">{d.assigned_mechanic}</p><p className="text-[11px] text-emerald-600 font-semibold">● {t("ops.assigned")}</p></div>
              </div>
              <div className="flex gap-1.5 mt-3">
                <button className="flex-1 rounded-lg border border-border py-1.5 text-[11px] font-medium hover:bg-muted">{t("ops.call")}</button>
                <button className="flex-1 rounded-lg border border-border py-1.5 text-[11px] font-medium hover:bg-muted">{t("ops.message")}</button>
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg bg-primary text-primary-foreground py-1.5 text-[11px] font-medium flex items-center justify-center gap-1"><Navigation className="size-3" />GPS</a>
                ) : (
                  <button className="flex-1 rounded-lg bg-primary text-primary-foreground py-1.5 text-[11px] font-medium flex items-center justify-center gap-1"><Navigation className="size-3" />GPS</button>
                )}
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">{d.assigned_mechanic ? t("ops.reassign_add") : t("ops.assign_technician")}</p>
            {mechanics.slice(0, 5).map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1.5 text-sm border-b border-border/60 last:border-0">
                <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-bold">{m.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                <span className="flex-1 truncate text-[13px]">{m.name}</span>
                <button onClick={() => onAssign(m.id)} disabled={d.assigned_user_id === m.id}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full font-medium",
                    d.assigned_user_id === m.id ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" : "bg-primary/10 text-primary hover:bg-primary/20")}>
                  {d.assigned_user_id === m.id ? t("ops.assigned") : t("ops.assign")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reassurance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {reassure.map((r) => (
          <div key={r.label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
            <span className={cn("grid size-4 place-items-center rounded-full text-[10px] font-bold", r.ok ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-600")}>{r.ok ? "✓" : "…"}</span>
            <span className={cn("truncate", r.ok ? "text-foreground font-medium" : "text-muted-foreground")}>{r.label}</span>
          </div>
        ))}
      </div>

      {/* Customer + Vehicle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t("ops.customer")}</h3>
            {d.customer && <Link href={`/customers/${d.customer.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">360 <ArrowUpRight className="size-3" /></Link>}
          </div>
          {d.customer ? (
            <>
              <p className="text-sm font-semibold text-foreground">{d.customer.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">{d.customer.phone ?? "—"}</p>
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t("ops.vehicle_live_health")}</h3>
            {d.vehicle && (
              <div className="flex items-center gap-3">
                <Link href={`/vehicles/${d.vehicle.id}`} className="text-xs text-primary hover:underline flex items-center gap-1"><Wrench className="size-3" />{t("ops.health")}</Link>
                <Link href={`/passport/${d.vehicle.id}`} target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1"><QrCode className="size-3" />{t("ops.passport")}</Link>
              </div>
            )}
          </div>
          {d.vehicle ? (
            <div className="flex items-center gap-4">
              <HealthGauge score={d.vehicle.score} band={d.vehicle.band} size={64} stroke={6} />
              <div><p className="text-sm font-semibold text-foreground">{d.vehicle.label}</p><p className="text-xs text-muted-foreground capitalize">{t(`band.${d.vehicle.band}`)}</p></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">{t("ops.no_vehicle")}</p>}
        </div>
      </div>

      {/* AI triage (structured placeholder — M4 wires real model) */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex items-center gap-2 text-primary mb-2">
          <Sparkles className="size-4" /><span className="text-[11px] font-semibold uppercase tracking-wide">{t("ops.ai_triage")}</span><Badge variant="primary" size="sm">{t("ops.beta")}</Badge>
        </div>
        <p className="text-sm text-foreground/90">
          {t("ops.ai.prefix")} <b>{d.severity}</b> {d.case_type} {t("ops.ai.body")}
        </p>
      </div>

      {/* Timeline (from the event stream) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">{t("ops.timeline")}</h3>
        {d.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ops.no_events")}</p>
        ) : (
          <div className="relative pl-5">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
            {d.timeline.map((e, i) => (
              <div key={i} className="relative pb-4 last:pb-0">
                <span className={cn("absolute -left-[15px] top-0.5 size-2.5 rounded-full ring-2 ring-card", TL_DOT[e.severity ?? "low"])} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">{relTime(e.date)}</p>
                </div>
                {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
