"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Loader2, Search, X } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { CaseMechanic, Customer360, CustomerList, CustomerListItem } from "@/lib/api/types";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} leftIcon={leftIcon ?? <CalendarPlus className="size-4" />} onClick={() => setOpen(true)}>
        {label ?? t("sched.new_appointment")}
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

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [mechanics, setMechanics] = useState<CaseMechanic[]>([]);
  const [query, setQuery] = useState("");
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

  // Load pickers once.
  useEffect(() => {
    clientFetch<CustomerList>("/customers?limit=200").then((r) => setCustomers(r.items)).catch(() => {});
    clientFetch<CaseMechanic[]>("/cases/mechanics").then(setMechanics).catch(() => {});
  }, []);

  // Load the chosen customer's vehicles.
  useEffect(() => {
    if (!customer) { setVehicles([]); setVehicleId(""); return; }
    setLoadingVehicles(true);
    clientFetch<Customer360>(`/customers/${customer.id}`)
      .then((c) => {
        const vs = c.vehicles.map((v) => ({ id: v.id, label: v.label }));
        setVehicles(vs);
        const wanted = preset?.vehicleId && vs.some((v) => v.id === preset.vehicleId) ? preset.vehicleId : "";
        setVehicleId(wanted || (vs.length === 1 ? vs[0].id : ""));
      })
      .catch(() => setVehicles([]))
      .finally(() => setLoadingVehicles(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) =>
      c.full_name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query, customers]);

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
          mechanic_name: mechanic || null,
          customer_notes: notes.trim() || null,
        }),
      });
      toast({ title: t("sched.appt_booked"), description: t("sched.appt_booked_desc", { name: customer.full_name, date, time }), variant: "success" });
      onCreated?.();
      onClose();
    } catch (err) {
      // A read-only demo session already shows its own toast; avoid a duplicate.
      if (!(err instanceof ClientApiError && err.status === 403)) {
        toast({ title: t("sched.book_error_title"), description: t("sched.book_error_desc"), variant: "danger" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("sched.new_appointment")}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-base font-bold"><CalendarPlus className="size-4 text-primary" /> {t("sched.new_appointment")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label={t("sched.close")}><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer */}
          <div>
            <label className={LABEL} htmlFor="appt-customer">{t("sched.customer")}</label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{customer.full_name}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setCustomer(null); setQuery(""); }}>{t("sched.change")}</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input id="appt-customer" className={`${FIELD} pl-9`} placeholder={t("sched.search_customers")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                </div>
                {matches.length > 0 && (
                  <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {matches.map((c) => (
                      <button key={c.id} onClick={() => setCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors">
                        <span className="font-medium">{c.full_name}</span>
                        {c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Vehicle */}
          <div>
            <label className={LABEL} htmlFor="appt-vehicle">{t("sched.vehicle")}</label>
            <select id="appt-vehicle" className={FIELD} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customer || loadingVehicles}>
              <option value="">{!customer ? t("sched.pick_customer_first") : loadingVehicles ? t("sched.loading") : vehicles.length ? t("sched.select_vehicle") : t("sched.no_vehicles")}</option>
              {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
            </select>
          </div>

          {/* Date / time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="appt-date">{t("sched.date")}</label>
              <input id="appt-date" type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="appt-time">{t("sched.time")}</label>
              <input id="appt-time" type="time" className={FIELD} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Duration / mechanic */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="appt-duration">{t("sched.duration")}</label>
              <select id="appt-duration" className={FIELD} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (<option key={d} value={d}>{t("sched.n_min", { n: d })}</option>))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="appt-mechanic">{t("sched.mechanic")}</label>
              <select id="appt-mechanic" className={FIELD} value={mechanic} onChange={(e) => setMechanic(e.target.value)}>
                <option value="">{t("sched.unassigned")}</option>
                {mechanics.map((m) => (<option key={m.id} value={m.name}>{m.name}</option>))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL} htmlFor="appt-notes">{t("sched.service_notes")} <span className="font-normal text-muted-foreground">{t("sched.optional")}</span></label>
            <textarea id="appt-notes" className={`${FIELD} resize-none`} rows={2} placeholder={t("sched.notes_placeholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
          <Button size="sm" disabled={!canSave} onClick={save} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}>
            {saving ? t("sched.booking") : t("sched.book_appointment")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
