"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Loader2, Plus, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { MechanicAccount, Customer360, CustomerListItem } from "@/lib/api/types";
import { CustomerPicker } from "@/components/intake/customer-picker";
import { NewCustomerModal, NewVehicleModal } from "@/components/intake/intake-modals";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1.5";
const DURATIONS = [30, 60, 90, 120, 180];

type Vehicle = { id: string; label: string };

function todayIso(): string {
  // Local date as YYYY-MM-DD without pulling in a date lib.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Self-contained trigger: a button that opens the modal and refreshes on create.
export function NewAppointmentButton({
  onCreated,
  presetDate,
  label,
  size = "sm",
  variant,
  leftIcon,
}: {
  onCreated?: () => void;
  presetDate?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "outline" | "ghost";
  leftIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <Button size={size} variant={variant} leftIcon={leftIcon ?? <CalendarPlus className="size-4" />} onClick={() => setOpen(true)}>
        {label ?? t("appointment.new")}
      </Button>
      {open ? <NewAppointmentModal onClose={() => setOpen(false)} onCreated={onCreated} presetDate={presetDate} /> : null}
    </>
  );
}

export function NewAppointmentModal({
  onClose,
  onCreated,
  presetDate,
  preset,
}: {
  onClose: () => void;
  onCreated?: () => void;
  presetDate?: string;
  preset?: { id: string; name: string; vehicleId?: string };
}) {
  const { toast } = useToast();
  const { t } = useI18n();

  // When opened from a customer/vehicle context, the customer is pre-selected.
  const presetCustomer: CustomerListItem | null = preset
    ? { id: preset.id, full_name: preset.name, phone: null, email: null, vehicle_count: 0, lifetime_value: 0, tier: "", last_visit: null }
    : null;

  const [mechanics, setMechanics] = useState<MechanicAccount[]>([]);
  const [customer, setCustomer] = useState<CustomerListItem | null>(presetCustomer);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(presetDate || todayIso());
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [mechanic, setMechanic] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleError, setVehicleError] = useState(false);
  const [mechanicError, setMechanicError] = useState(false);
  const [loadingMechanics, setLoadingMechanics] = useState(true);
  const [retryVehicles, setRetryVehicles] = useState(0);
  const [retryMechanics, setRetryMechanics] = useState(0);
  const [intake, setIntake] = useState<"customer" | "vehicle" | null>(null);

  useEffect(() => {
    let active = true;
    setMechanicError(false);
    setLoadingMechanics(true);
    clientFetch<{ items: MechanicAccount[] }>("/mechanics").then((data) => { if (active) setMechanics(data.items); })
      .catch(() => { if (active) setMechanicError(true); })
      .finally(() => { if (active) setLoadingMechanics(false); });
    return () => { active = false; };
  }, [retryMechanics]);

  // Load the chosen customer's vehicles.
  useEffect(() => {
    if (!customer) { setVehicles([]); setVehicleId(""); return; }
    let active = true;
    setLoadingVehicles(true);
    setVehicleId(""); setVehicles([]); setVehicleError(false);
    clientFetch<Customer360>(`/customers/${customer.id}`)
      .then((c) => {
        if (!active) return;
        const vs = c.vehicles.map((v) => ({ id: v.id, label: v.label }));
        setVehicles(vs);
        const wanted = preset?.vehicleId && vs.some((v) => v.id === preset.vehicleId) ? preset.vehicleId : "";
        setVehicleId(wanted || (vs.length === 1 ? vs[0].id : ""));
      })
      .catch(() => { if (active) setVehicleError(true); })
      .finally(() => { if (active) setLoadingVehicles(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, retryVehicles]);

  const canSave = Boolean(customer && vehicleId && date && time) && !saving;

  async function save() {
    if (!customer || !vehicleId) return;
    setSaving(true);
    try {
      await clientFetch("/appointments/direct", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          vehicle_id: vehicleId,
          appointment_date: date,
          appointment_time: time,
          estimated_duration_minutes: duration,
          mechanic_user_id: mechanic || null,
          customer_notes: notes.trim() || null,
        }),
      });
      toast({ title: t("appointment.booked"), description: `${customer.full_name} · ${date} ${time}`, variant: "success" });
      onCreated?.();
      onClose();
    } catch (err) {
      // A read-only demo session already shows its own toast; avoid a duplicate.
      if (!(err instanceof ClientApiError && err.status === 403)) {
        toast({ title: t("appointment.book_failed"), description: err instanceof ClientApiError && err.code === "APPOINTMENT_CONFLICT" ? t("appointment.conflict") : undefined, variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent size="md" noPadding hideClose aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-bold"><CalendarPlus className="size-4 text-primary" /> {t("appointment.new")}</DialogTitle>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("common.close")}><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer */}
          <div>
            <label className={LABEL} htmlFor="appt-customer">{t("work.customer")}</label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{customer.full_name}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCustomer(null)}>{t("invoice.change")}</button>
              </div>
            ) : (
              <>
                <CustomerPicker id="appt-customer" onSelect={setCustomer} />
              </>
            )}
            <button onClick={() => setIntake("customer")} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="size-3" />{t("intake.new_customer")}</button>
          </div>

          {/* Vehicle */}
          <div>
            <label className={LABEL} htmlFor="appt-vehicle">{t("work.vehicle")}</label>
            <select id="appt-vehicle" className={FIELD} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customer || loadingVehicles}>
              <option value="">{!customer ? t("appointment.pick_customer") : loadingVehicles ? t("appointment.loading") : vehicles.length ? t("appointment.select_vehicle") : t("appointment.no_vehicles")}</option>
              {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
            </select>
            {vehicleError ? <p role="alert" className="mt-2 text-xs text-red-600">{t("intake.load_failed")} <button className="underline" onClick={() => setRetryVehicles((n) => n + 1)}>{t("intake.retry")}</button></p> : null}
            {customer ? <button onClick={() => setIntake("vehicle")} disabled={loadingVehicles} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"><Plus className="size-3" />{t("intake.new_vehicle")}</button> : null}
          </div>

          {/* Date / time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="appt-date">{t("appointment.date")}</label>
              <input id="appt-date" type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="appt-time">{t("appointment.time")}</label>
              <input id="appt-time" type="time" className={FIELD} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Duration / mechanic */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="appt-duration">{t("appointment.duration")}</label>
              <select id="appt-duration" className={FIELD} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (<option key={d} value={d}>{d} min</option>))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="appt-mechanic">{t("work.mechanic")}</label>
              <select id="appt-mechanic" className={FIELD} value={mechanic} onChange={(e) => setMechanic(e.target.value)} disabled={saving || loadingMechanics || mechanicError}>
                <option value="">{loadingMechanics ? t("appointment.loading") : t("work.unassigned")}</option>
                {mechanics.map((m) => (<option key={m.id} value={m.id}>{m.full_name} · {m.email}</option>))}
              </select>
              {!loadingMechanics && !mechanicError && !mechanics.length ? <p className="mt-2 text-xs text-muted-foreground">{t("work.no_mechanics")}</p> : null}
              {mechanicError ? <p role="alert" className="mt-2 text-xs text-red-600">{t("intake.load_failed")} <button className="underline" onClick={() => setRetryMechanics((n) => n + 1)}>{t("intake.retry")}</button></p> : null}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL} htmlFor="appt-notes">{t("appointment.notes")} <span className="font-normal text-muted-foreground">({t("invoice.vehicle_optional")})</span></label>
            <textarea id="appt-notes" className={`${FIELD} resize-none`} rows={2} placeholder={t("appointment.notes_hint")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button size="sm" disabled={!canSave} onClick={save} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}>
            {saving ? t("appointment.booking") : t("appointment.book")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {intake === "customer" ? <NewCustomerModal onClose={() => setIntake(null)} onCreated={setCustomer} /> : null}
    {intake === "vehicle" && customer ? <NewVehicleModal presetCustomer={customer} onClose={() => setIntake(null)} onCreated={(vehicle) => { setVehicles((current) => [...current, { id: vehicle.id, label: vehicle.label }]); setVehicleId(vehicle.id); }} /> : null}
  </>;
}
