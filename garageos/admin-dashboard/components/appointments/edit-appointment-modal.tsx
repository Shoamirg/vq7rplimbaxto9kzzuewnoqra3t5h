"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Loader2, X } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, CaseMechanic } from "@/lib/api/types";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
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
  const { t } = useI18n();
  const [mechanics, setMechanics] = useState<CaseMechanic[]>([]);
  const [date, setDate] = useState(appointment.appointment_date.slice(0, 10));
  const [time, setTime] = useState(appointment.appointment_time || "09:00");
  const [duration, setDuration] = useState(appointment.estimated_duration_minutes || 60);
  const [mechanic, setMechanic] = useState(appointment.mechanic_name || "");
  const [notes, setNotes] = useState(appointment.notes || "");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  function loadMechanics() {
    setLoadError(false);
    clientFetch<CaseMechanic[]>("/cases/mechanics").then(setMechanics).catch(() => setLoadError(true));
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
          mechanic_name: mechanic,
          notes: notes,
        }),
      });
      toast({ title: t("appointment.updated"), description: `${date} ${time}`, variant: "success" });
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("appointment.edit")}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-base font-bold"><CalendarClock className="size-4 text-primary" /> {t("appointment.edit")}</h2>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("common.close")}><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadError && <div role="alert" className="text-sm text-red-600">{t("common.load_failed")} <button onClick={loadMechanics} className="underline">{t("common.retry")}</button></div>}
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
                {DURATIONS.map((d) => (<option key={d} value={d}>{t("appointment.minutes", { n: d })}</option>))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="edit-mechanic">{t("work.mechanic")}</label>
              <select id="edit-mechanic" className={FIELD} value={mechanic} onChange={(e) => setMechanic(e.target.value)}>
                <option value="">{t("work.unassigned")}</option>
                {mechanics.map((m) => (<option key={m.id} value={m.name}>{m.name}</option>))}
                {mechanic && !mechanics.some((m) => m.name === mechanic) ? <option value={mechanic}>{mechanic}</option> : null}
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
      </div>
    </div>,
    document.body,
  );
}
