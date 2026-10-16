"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import Link from "next/link";
import { cn } from "@garageos/design-system";
import type { CaseDetail, CaseMechanic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { enumLabel, fmtTimer, mechanicLabels, NEXT_STATUS, operationControl, relTime } from "./shared";

const card = "rounded-2xl border border-border bg-card p-4 space-y-3 min-w-0 [overflow-wrap:anywhere]";
export function CaseDetailPanel({ detail: d, mechanics, mechanicsError, retryMechanics, now, canWrite, pending, onAssign, onStatus, refresh, headingRef }: {
  detail: CaseDetail; mechanics: CaseMechanic[] | null; mechanicsError: boolean; retryMechanics: () => void;
  now: number; canWrite: boolean; pending: boolean; onAssign: (id: string) => void; onStatus: (status: string) => void;
  refresh: () => void; headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t, fmt } = useI18n();
  const [mechanic, setMechanic] = useState(d.assigned_user_id ?? "");
  useEffect(() => { setMechanic(d.assigned_user_id ?? ""); }, [d.id, d.assigned_user_id]);
  const labels = useMemo(() => mechanicLabels(mechanics ?? []), [mechanics]);
  const next = NEXT_STATUS[d.status] ?? [];
  return <div className="space-y-4 p-3 lg:p-4">
    <div className={card}>
      <p className="text-sm text-foreground">{t("ops.case")} <span className="font-mono text-foreground">{d.code}</span></p>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold focus-visible:outline-2 focus-visible:outline-primary">{d.title}</h2>
      <p className="text-sm">{t("ops.status")}: <strong>{enumLabel(t, "status", d.status)}</strong></p>
      <p className="text-sm">{t("ops.severity")}: {enumLabel(t, "severity", d.severity)} · {enumLabel(t, "type", d.case_type)}</p>
      {d.channel && <p className="text-sm text-foreground">{t("ops.channel")}: {d.channel}</p>}
      {d.is_open && <p className="text-sm">{t("ops.sla")}: {fmtTimer((now - new Date(d.created_at).getTime()) / 1000, t, fmt.number)} / {fmtTimer(d.sla_response_minutes * 60, t, fmt.number)}</p>}
      {d.sla_breached && <p className="text-sm font-medium text-destructive">{t("ops.breached")}</p>}
      {d.description && <div><h3 className="text-sm font-medium">{t("ops.description")}</h3><p className="whitespace-pre-wrap text-sm">{d.description}</p></div>}
      <button className={operationControl} disabled={pending} onClick={refresh}>{t("ops.refresh_detail")}</button>
    </div>
    <div className="flex flex-wrap gap-2">{next.map(status => <button key={status} className={cn(operationControl, "bg-primary text-primary-foreground hover:bg-primary/90")} disabled={!canWrite || pending} onClick={() => onStatus(status)}>{pending ? t("ops.saving") : t("ops.set_status", { status: enumLabel(t, "status", status) })}</button>)}</div>
    <section className={card} aria-label={t("ops.mechanic")}>
      <h3 className="font-semibold">{t("ops.mechanic")}</h3>
      <p className="text-sm">{d.assigned_user_id ? labels.get(d.assigned_user_id) ?? `${d.assigned_mechanic ?? t("ops.unknown")} · ${d.assigned_user_id}` : t("ops.not_recorded")}</p>
      {mechanicsError ? <div role="alert" className="space-y-2 text-sm"><p>{t("ops.roster_error")}</p><button className={operationControl} onClick={retryMechanics}>{t("ops.retry")}</button></div> : !mechanics ? <p role="status">{t("ops.loading")}</p> : mechanics.length === 0 ? <p className="text-sm">{t("ops.no_mechanics")}</p> : <div className="space-y-2">
        <label className="block text-sm"><span>{t("ops.mechanic")}</span><select aria-label={t("ops.mechanic")} className="mt-1 w-full min-w-0 min-h-11 rounded-lg border border-border bg-background px-2" value={mechanic} disabled={!canWrite || pending} onChange={event => setMechanic(event.target.value)}><option value="">{t("ops.choose_mechanic")}</option>{mechanics.map(item => <option key={item.id} value={item.id}>{labels.get(item.id)}</option>)}</select></label>
        <button className={operationControl} disabled={!canWrite || pending || !mechanic || mechanic === d.assigned_user_id} onClick={() => onAssign(mechanic)}>{pending ? t("ops.saving") : t("ops.assign")}</button>
      </div>}
    </section>
    <section className={card}><h3 className="font-semibold">{t("ops.location")}</h3><p className="text-sm">{d.location_text ?? t("ops.not_recorded")}</p>{d.location_lat !== null && d.location_lng !== null && <p className="text-sm">{t("ops.coordinates", { lat: fmt.number(d.location_lat), lng: fmt.number(d.location_lng) })}</p>}</section>
    <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
      <section className={card}><h3 className="font-semibold">{t("ops.customer")}</h3>{d.customer ? <><p className="text-sm">{d.customer.name}</p>{d.customer.phone && <p className="text-sm">{d.customer.phone}</p>}<Link className={cn(operationControl, "inline-flex items-center")} href={`/customers/${d.customer.id}`}>{t("ops.customer_open")}</Link></> : <p>{t("ops.not_recorded")}</p>}</section>
      <section className={card}><h3 className="font-semibold">{t("ops.vehicle")}</h3>{d.vehicle ? <><p className="text-sm">{d.vehicle.label ?? t("ops.not_recorded")}</p><div className="flex flex-wrap gap-2"><Link className={cn(operationControl, "inline-flex items-center")} href={`/vehicles/${d.vehicle.id}`}>{t("ops.vehicle_open")}</Link><Link className={cn(operationControl, "inline-flex items-center")} href={`/passport/${d.vehicle.id}`}>{t("ops.passport")}</Link></div></> : <p className="text-sm">{t("ops.no_vehicle")}</p>}</section>
    </div>
    <section className={card}><h3 className="font-semibold">{t("ops.timeline")}</h3>{d.timeline.length === 0 ? <p className="text-sm">{t("ops.no_events")}</p> : <ol className="space-y-3">{d.timeline.map((event, i) => <li key={`${event.date}:${i}`} className="border-l-2 border-primary/40 pl-3"><p className="text-sm font-medium">{event.title}</p>{event.detail && <p className="whitespace-pre-wrap text-sm text-foreground">{event.detail}</p>}<time dateTime={event.date} title={fmt.date(event.date)} className="text-xs text-foreground">{relTime(event.date, now, t, fmt.number)}</time></li>)}</ol>}</section>
  </div>;
}
