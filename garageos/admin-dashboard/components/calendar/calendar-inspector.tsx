"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";
import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, Customer360, DueServices, VehicleHealth } from "@/lib/api/types";
import { CompleteWorkModal } from "@/components/appointments/complete-work-modal";
import { EditAppointmentModal } from "@/components/appointments/edit-appointment-modal";
import { HealthGauge } from "@/components/vehicles/health-gauge";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { editable, recordedPhone, recordedTelegram } from "./calendar-model";

const LINK = "min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-border px-3 text-sm text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary";

export function CalendarInspector({ appointment, onClose, onChanged, returnFocus }: {
  appointment: Appointment; onClose: () => void; onChanged: (action: string) => void; returnFocus: () => void;
}) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [health, setHealth] = useState<VehicleHealth | null>(null);
  const [due, setDue] = useState<DueServices | null>(null);
  const [contacts, setContacts] = useState<Customer360 | null>(null);
  const [healthState, setHealthState] = useState("loading");
  const [contactState, setContactState] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<"edit" | "complete" | null>(null);
  useEffect(() => {
    let alive = true;
    setHealth(null); setDue(null); setContacts(null); setHealthState("loading"); setContactState("loading");
    Promise.all([clientFetch<VehicleHealth>(`/vehicles/${appointment.vehicle_id}/health`), clientFetch<DueServices>(`/vehicles/${appointment.vehicle_id}/due-services`)])
      .then(([h, d]) => { if (alive) { setHealth(h); setDue(d); setHealthState("ready"); } })
      .catch(() => { if (alive) setHealthState("error"); });
    clientFetch<Customer360>(`/customers/${appointment.customer_id}`)
      .then(c => { if (alive) { setContacts(c); setContactState("ready"); } })
      .catch(() => { if (alive) setContactState("error"); });
    return () => { alive = false; };
  }, [appointment.vehicle_id, appointment.customer_id, retry]);

  async function act(action: "confirm" | "start" | "cancel") {
    if (busy) return;
    if (action === "start" && !appointment.mechanic_name?.trim()) {
      toast({ title: t("work.assign_first"), variant: "warning" }); return;
    }
    setBusy(action);
    try { await clientFetch(`/appointments/${appointment.id}/${action}`, { method: "PATCH" }); onChanged(action); }
    catch { toast({ title: t("work.failed"), variant: "danger" }); setBusy(null); }
  }
  if (form === "complete") return <CompleteWorkModal appointment={appointment} onClose={() => setForm(null)} onCompleted={() => onChanged("complete")} />;
  if (form === "edit") return <EditAppointmentModal appointment={appointment} onClose={() => setForm(null)} onSaved={() => onChanged("edit")} />;
  const phone = recordedPhone(contacts?.phone);
  const telegram = recordedTelegram(contacts?.telegram_username);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent hideClose aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }}>
      <div className="flex items-start justify-between gap-2">
        <DialogTitle className="leading-normal">{t("calendar.details")}</DialogTitle>
        <div className="flex shrink-0 gap-1"><LanguageSwitcher /><button type="button" disabled={!!busy} onClick={onClose} aria-label={t("common.close")} className="min-h-11 min-w-11 rounded-lg hover:bg-muted"><X className="size-4 mx-auto" /></button></div>
      </div>
      <p className="text-sm font-semibold">{t(`status.${appointment.status}`)}</p>
      <p className="mt-3 font-bold break-words">{appointment.service_type || t("common.general_service")}</p>
      <p className="text-sm break-words">{appointment.vehicle_summary}</p>
      <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <Field label={t("work.customer")} value={appointment.customer_name} />
        <Field label={t("work.mechanic")} value={appointment.mechanic_name || t("work.unassigned")} />
        <Field label={t("work.when")} value={`${fmt.date(appointment.appointment_date)} · ${appointment.appointment_time} · ${t("appointment.minutes", { n: fmt.number(appointment.estimated_duration_minutes) })}`} />
        <Field label={t("work.billing")} value={appointment.total_cost != null ? fmt.money(appointment.total_cost, "UZS") : "—"} />
      </dl>
      <section className="mt-4 space-y-2">
        {contactState === "loading" ? <p role="status" className="text-sm">{t("appointment.loading")}</p> : contactState === "error" ? <p role="alert" className="text-sm">{t("calendar.contact_failed")} <button type="button" onClick={() => setRetry(n => n + 1)} className={LINK}>{t("common.retry")}</button></p> : <div className="flex flex-wrap gap-2">
          {phone ? <a className={LINK} href={phone}>{t("calendar.call")}</a> : <p className="text-xs text-muted-foreground">{t("calendar.no_phone")}</p>}
          {telegram ? <a className={LINK} href={telegram} target="_blank" rel="noopener noreferrer">{t("calendar.telegram")}</a> : <p className="text-xs text-muted-foreground">{t("calendar.no_telegram")}</p>}
        </div>}
        <Link className={LINK} href={`/customers/${appointment.customer_id}`}>{t("calendar.customer_profile")}</Link>
      </section>
      <section className="mt-4 rounded-xl border border-border p-3">
        <h2 className="text-sm font-semibold">{t("calendar.health")}</h2>
        {healthState === "error" ? <p role="alert" className="text-sm">{t("calendar.health_failed")} <button className={LINK} onClick={() => setRetry(n => n + 1)}>{t("common.retry")}</button></p> : health ? <div className="flex items-center gap-3 my-2">
          <HealthGauge score={health.overall_score} band={health.band} size={80} stroke={8} />
          <div className="text-sm"><p>{t(`band.${health.band}`)}</p><p>{t("calendar.health_summary", { overdue: fmt.number(health.urgent_count), soon: fmt.number(health.due_soon_count) })}</p></div>
        </div> : <p role="status" className="text-sm my-2">{t("feedback.loading_vehicle_health")}</p>}
        <div className="flex flex-wrap gap-2">
          <Link className={LINK} href={`/vehicles/${appointment.vehicle_id}`}>{t("nav.vehicles")}</Link>
          <Link className={LINK} href={`/passport/${appointment.vehicle_id}`} target="_blank">{t("calendar.passport")}</Link>
        </div>
      </section>
      {due && due.services.length > 0 && <section className="mt-4 space-y-2">
        <h2 className="text-sm font-semibold">{t("calendar.due_services")}</h2>
        {due.services.slice(0, 5).map(service => <div key={service.service_type} className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="break-words">{service.service_type}</span><Badge variant={service.remaining_km != null && service.remaining_km < 0 ? "danger" : "warning"}>{t(service.remaining_km != null && service.remaining_km < 0 ? "calendar.overdue" : "calendar.due_soon")}</Badge>
        </div>)}
      </section>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {editable(appointment) && <Button disabled={!!busy} onClick={() => setForm("edit")}>{t("appointment.edit")}</Button>}
        {appointment.status === "pending" && <Button disabled={!!busy} loading={busy === "confirm"} onClick={() => act("confirm")}>{t("work.confirm")}</Button>}
        {appointment.status === "confirmed" && <Button disabled={!!busy} loading={busy === "start"} onClick={() => act("start")}>{t("work.start")}</Button>}
        {appointment.status === "in_progress" && <Button onClick={() => setForm("complete")}>{t("work.complete")}</Button>}
        {editable(appointment) && <Button variant="outline" disabled={!!busy} loading={busy === "cancel"} onClick={() => act("cancel")}>{t("work.cancel")}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}
