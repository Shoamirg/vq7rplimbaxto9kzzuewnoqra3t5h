"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, MechanicAccount } from "@/lib/api/types";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1.5";
const DURATIONS = [30, 60, 90, 120, 180];

export function EditAppointmentModal({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const { t, fmt } = useI18n();
  const [mechanics, setMechanics] = useState<MechanicAccount[]>([]);
  const [date, setDate] = useState(appointment.appointment_date.slice(0, 10));
  const [time, setTime] = useState(appointment.appointment_time || "09:00");
  const [duration, setDuration] = useState(appointment.estimated_duration_minutes || 60);
  const initialMechanic = appointment.mechanic_user_id || (appointment.mechanic_name ? `legacy:${appointment.mechanic_name}` : "");
  const [mechanic, setMechanic] = useState(initialMechanic);
  const [notes, setNotes] = useState(appointment.notes || "");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMechanics, setLoadingMechanics] = useState(true);

  function loadMechanics() {
    setLoadError(false);
    setLoadingMechanics(true);
    clientFetch<{ items: MechanicAccount[] }>("/mechanics")
      .then((data) => setMechanics(data.items)).catch(() => setLoadError(true))
      .finally(() => setLoadingMechanics(false));
  }

  useEffect(() => {
    loadMechanics();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await clientFetch(`/appointments/${appointment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          appointment_date: `${date}T${time}:00Z`,
          appointment_time: time,
          estimated_duration_minutes: duration,
          ...(mechanic === initialMechanic ? {} : mechanic ? { mechanic_user_id: mechanic } : { mechanic_name: "" }),
          notes: notes,
        }),
      });
      toast({ title: t("appointment.updated"), description: `${fmt.date(date)} ${time}`, variant: "success" });
      onSaved?.();
      onClose();
    } catch (err) {
      if (!(err instanceof ClientApiError && err.status === 403)) {
        toast({ title: t(err instanceof ClientApiError && err.code === "APPOINTMENT_CONFLICT" ? "appointment.conflict" : "appointment.update_failed"), variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent hideClose noPadding aria-describedby={undefined} className="max-h-[90dvh] overflow-auto sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-bold"><CalendarClock className="size-4 text-primary" /> {t("appointment.edit")}</DialogTitle>
          <button onClick={onClose} disabled={saving} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" aria-label={t("common.close")}><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadError && <div role="alert" className="text-sm text-red-600">{t("common.load_failed")} <button onClick={loadMechanics} className="min-h-11 min-w-11 rounded-lg border border-border px-3 underline focus-visible:ring-2 focus-visible:ring-primary">{t("common.retry")}</button></div>}
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <div className="font-medium">{appointment.customer_name || "—"}</div>
            <div className="text-muted-foreground text-xs">{appointment.vehicle_summary || ""}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="edit-date">{t("appointment.date")}</label>
              <input id="edit-date" type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="edit-time">{t("appointment.time")}</label>
              <input id="edit-time" type="time" className={FIELD} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="edit-duration">{t("appointment.duration")}</label>
              <select id="edit-duration" className={FIELD} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {Array.from(new Set([...DURATIONS, appointment.estimated_duration_minutes])).sort((a, b) => a - b).map((d) => (<option key={d} value={d}>{t("appointment.minutes", { n: d })}</option>))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="edit-mechanic">{t("work.mechanic")}</label>
              <select id="edit-mechanic" className={FIELD} value={mechanic} disabled={saving || loadingMechanics || loadError} onChange={(e) => setMechanic(e.target.value)}>
                <option value="">{t("work.unassigned")}</option>
                {mechanics.map((m) => (<option key={m.id} value={m.id}>{m.full_name} · {m.email}</option>))}
                {initialMechanic && !mechanics.some((m) => m.id === initialMechanic) ? <option value={initialMechanic}>{appointment.mechanic_name}</option> : null}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="edit-notes">{t("invoice.notes")}</label>
            <textarea id="edit-notes" className={`${FIELD} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>{t("common.cancel")}</Button>
          <Button size="sm" disabled={saving} onClick={save} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}>
            {saving ? t("invoice.saving") : t("invoice.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
