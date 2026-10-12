"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardPlus, Loader2, Search, X } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";
import { ClientApiError, clientFetch } from "@/lib/api/client";
import type { CaseMechanic, Customer360, Customer360Vehicle, CustomerList, CustomerListItem, WorkOrder } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground";
const FIELD = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60";

export function WorkOrderIntakeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: WorkOrder) => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastAttempt = useRef<{ body: string; key: string } | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerListItem[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerSearchFailed, setCustomerSearchFailed] = useState(false);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [vehicles, setVehicles] = useState<Customer360Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [mechanics, setMechanics] = useState<CaseMechanic[]>([]);
  const [mechanicId, setMechanicId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [concern, setConcern] = useState("");
  const [intakeKm, setIntakeKm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleLoadFailed, setVehicleLoadFailed] = useState(false);

  useEffect(() => {
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setMatches([]); setSearchingCustomers(false); setCustomerSearchFailed(false); return; }
    let active = true;
    setMatches([]);
    setSearchingCustomers(true);
    setCustomerSearchFailed(false);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: value, limit: "8" });
      clientFetch<CustomerList>(`/customers?${params}`)
        .then((response) => { if (active) setMatches(response.items); })
        .catch(() => { if (active) { setMatches([]); setCustomerSearchFailed(true); } })
        .finally(() => { if (active) setSearchingCustomers(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    clientFetch<CaseMechanic[]>("/cases/mechanics").then(setMechanics).catch(() => setMechanics([]));
  }, []);

  useEffect(() => {
    if (!customer) { setVehicles([]); setVehicleId(""); setLoadingVehicles(false); setVehicleLoadFailed(false); return; }
    let active = true;
    setLoadingVehicles(true);
    setVehicleLoadFailed(false);
    clientFetch<Customer360>(`/customers/${customer.id}`)
      .then((profile) => {
        if (!active) return;
        setVehicles(profile.vehicles);
        setVehicleId("");
        setIntakeKm("");
      })
      .catch(() => { if (active) { setVehicles([]); setVehicleLoadFailed(true); } })
      .finally(() => { if (active) setLoadingVehicles(false); });
    return () => { active = false; };
  }, [customer]);

  const selectedVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null, [vehicles, vehicleId]);

  function chooseVehicle(id: string) {
    setVehicleId(id);
    const vehicle = vehicles.find((item) => item.id === id);
    setIntakeKm(vehicle ? String(vehicle.current_km ?? "") : "");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !vehicleId || !serviceType.trim()) return;
    const payload = {
      customer_id: customer.id,
      vehicle_id: vehicleId,
      service_type: serviceType.trim(),
      customer_concern: concern.trim() || null,
      intake_odometer_km: intakeKm === "" ? null : Number(intakeKm),
      assigned_mechanic_user_id: mechanicId || null,
    };
    const fingerprint = JSON.stringify(payload);
    const key = lastAttempt.current?.body === fingerprint ? lastAttempt.current.key : crypto.randomUUID();
    lastAttempt.current = { body: fingerprint, key };
    setLoading(true);
    try {
      const order = await clientFetch<WorkOrder>("/work-orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      lastAttempt.current = null;
      onCreated(order);
    } catch (error) {
      if (!(error instanceof ClientApiError && error.status === 403)) {
        toast({ title: t("wo.operation_failed"), variant: "danger" });
      }
    } finally {
      setLoading(false);
    }
  }

  function keepFocusInside(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!elements.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="wo-intake-title" onKeyDown={keepFocusInside}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card shadow-xl sm:max-w-lg sm:rounded-lg">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="wo-intake-title" className="flex items-center gap-2 font-semibold text-foreground"><ClipboardPlus className="size-4 text-primary" />{t("wo.new")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("wo.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} aria-label={t("wo.close")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            <X className="size-4" />
          </button>
        </header>

        <form onSubmit={save}>
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <label htmlFor="wo-customer-search" className={LABEL}>{t("wo.customer")}</label>
              {customer ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="truncate text-sm font-medium text-foreground">{customer.full_name}</span>
                  <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => { setCustomer(null); setQuery(""); }}>
                    {t("wo.change")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input ref={searchRef} id="wo-customer-search" value={query} onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("wo.search_customer")} autoComplete="off" className={`${FIELD} pl-9`} />
                  </div>
                  {matches.length > 0 ? (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card" role="listbox" aria-label={t("wo.choose_customer")}>
                      {matches.map((item) => (
                        <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => { setCustomer(item); setQuery(""); setMatches([]); }}
                          className="block w-full border-b border-border px-3 py-2 text-left text-sm text-foreground last:border-0 hover:bg-muted focus-visible:outline-none focus-visible:bg-muted">
                          {item.full_name}
                        </button>
                      ))}
                    </div>
                  ) : query.trim().length >= 2 ? (
                    <p className="mt-1 text-xs text-muted-foreground" role="status">
                      {searchingCustomers ? t("wo.loading") : customerSearchFailed ? t("wo.customer_search_error") : t("wo.no_customer")}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <label htmlFor="wo-vehicle" className={LABEL}>{t("wo.vehicle")}</label>
              <select id="wo-vehicle" value={vehicleId} onChange={(event) => chooseVehicle(event.target.value)} disabled={!customer || loadingVehicles || vehicles.length === 0} className={FIELD}>
                <option value="">{!customer ? t("wo.choose_customer") : loadingVehicles ? t("wo.loading") : vehicleLoadFailed ? t("wo.vehicle_load_error") : vehicles.length ? t("wo.choose_vehicle") : t("wo.no_vehicles")}</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label} · {vehicle.year}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="wo-service-type" className={LABEL}>{t("wo.service")}</label>
              <input id="wo-service-type" required maxLength={100} value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder={t("wo.service_placeholder")} className={FIELD} />
            </div>

            <div>
              <label htmlFor="wo-concern" className={LABEL}>{t("wo.concern")}</label>
              <textarea id="wo-concern" rows={2} maxLength={5000} value={concern} onChange={(event) => setConcern(event.target.value)} placeholder={t("wo.concern_placeholder")} className={`${FIELD} resize-y`} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="wo-intake-km" className={LABEL}>{t("wo.intake_km")}</label>
                <input id="wo-intake-km" type="number" min={selectedVehicle?.current_km ?? 0} step="1" value={intakeKm} onChange={(event) => setIntakeKm(event.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="wo-mechanic" className={LABEL}>{t("wo.mechanic")}</label>
                <select id="wo-mechanic" value={mechanicId} onChange={(event) => setMechanicId(event.target.value)} className={FIELD}>
                  <option value="">{t("wo.unassigned")}</option>
                  {mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            <Button type="button" variant="ghost" disabled={loading} onClick={onClose}>{t("wo.cancel")}</Button>
            <Button type="submit" disabled={loading || !customer || !vehicleId || !serviceType.trim()} loading={loading}
              leftIcon={loading ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPlus className="size-4" />}>
              {loading ? t("wo.creating") : t("wo.create")}
            </Button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
