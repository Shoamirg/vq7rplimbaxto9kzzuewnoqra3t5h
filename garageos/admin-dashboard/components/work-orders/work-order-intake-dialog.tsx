"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Car, ClipboardPlus, Loader2, Search, UserPlus, X } from "lucide-react";
import { Button, useToast } from "@garageos/design-system";
import { ClientApiError, clientFetch } from "@/lib/api/client";
import type { CaseMechanic, Customer360, Customer360Vehicle, CustomerList, CustomerListItem, VehicleCatalogBrand, WorkOrder } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const LABEL = "mb-1.5 block text-xs font-semibold text-muted-foreground";
const FIELD = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60";

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
  const customerEmailRef = useRef<HTMLInputElement>(null);
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
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalogBrand[]>([]);
  const [vehicleCatalogFailed, setVehicleCatalogFailed] = useState(false);
  const [loadingVehicleCatalog, setLoadingVehicleCatalog] = useState(false);
  const [newVehicleBrandId, setNewVehicleBrandId] = useState("");
  const [newVehicleModelId, setNewVehicleModelId] = useState("");
  const [newVehicleYear, setNewVehicleYear] = useState(String(new Date().getFullYear()));
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [newVehicleKm, setNewVehicleKm] = useState("0");
  const [creatingVehicle, setCreatingVehicle] = useState(false);

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
    if (!customer) { setVehicles([]); setVehicleId(""); setLoadingVehicles(false); setVehicleLoadFailed(false); setNewVehicleOpen(false); return; }
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
  const selectedBrand = vehicleCatalog.find((brand) => brand.id === newVehicleBrandId);

  async function createCustomer() {
    const fullName = newCustomerName.trim();
    if (!fullName) return;
    if (customerEmailRef.current && !customerEmailRef.current.checkValidity()) {
      customerEmailRef.current.reportValidity();
      return;
    }
    setCreatingCustomer(true);
    try {
      const created = await clientFetch<{ id: string; full_name: string; phone: string | null; email: string | null }>("/customers", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, phone: newCustomerPhone.trim() || null, email: newCustomerEmail.trim() || null }),
      });
      setCustomer({
        ...created,
        vehicle_count: 0,
        lifetime_value: 0,
        tier: "standard",
        last_visit: null,
      });
      setQuery("");
      setMatches([]);
      setNewCustomerOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      toast({ title: t("wo.customer_created") });
    } catch {
      toast({ title: t("wo.operation_failed"), variant: "danger" });
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function openVehicleForm() {
    setNewVehicleOpen(true);
    if (vehicleCatalog.length || loadingVehicleCatalog) return;
    setVehicleCatalogFailed(false);
    setLoadingVehicleCatalog(true);
    try {
      setVehicleCatalog(await clientFetch<VehicleCatalogBrand[]>("/vehicles/catalog"));
    } catch {
      setVehicleCatalogFailed(true);
      toast({ title: t("wo.vehicle_load_error"), variant: "danger" });
    } finally {
      setLoadingVehicleCatalog(false);
    }
  }

  async function createVehicle() {
    if (!customer || !newVehicleBrandId || !newVehicleModelId || !newVehicleYear) return;
    setCreatingVehicle(true);
    let createdVehicleId: string;
    try {
      const createdVehicle = await clientFetch<{ id: string }>("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          brand_id: newVehicleBrandId,
          vehicle_model_id: newVehicleModelId,
          year: Number(newVehicleYear),
          license_plate: newVehiclePlate.trim() || null,
          current_km: newVehicleKm === "" ? 0 : Number(newVehicleKm),
        }),
      });
      createdVehicleId = createdVehicle.id;
    } catch {
      toast({ title: t("wo.operation_failed"), variant: "danger" });
      setCreatingVehicle(false);
      return;
    }

    setNewVehicleOpen(false);
    setNewVehicleBrandId("");
    setNewVehicleModelId("");
    setNewVehiclePlate("");
    setNewVehicleKm("0");
    setVehicleId("");
    setIntakeKm(newVehicleKm);
    setLoadingVehicles(true);
    setVehicleLoadFailed(false);
    try {
      const profile = await clientFetch<Customer360>(`/customers/${customer.id}`);
      setVehicles(profile.vehicles);
      const created = profile.vehicles.find((vehicle) => vehicle.id === createdVehicleId);
      setVehicleId(created?.id ?? "");
      setIntakeKm(String(created?.current_km ?? Number(newVehicleKm)));
      toast({ title: t("wo.vehicle_created") });
    } catch {
      setVehicleLoadFailed(true);
      toast({ title: t("wo.vehicle_created") });
      toast({ title: t("wo.vehicle_load_error"), variant: "danger" });
    } finally {
      setLoadingVehicles(false);
      setCreatingVehicle(false);
    }
  }

  async function retryVehicleLoad() {
    if (!customer) return;
    setLoadingVehicles(true);
    setVehicleLoadFailed(false);
    try {
      const profile = await clientFetch<Customer360>(`/customers/${customer.id}`);
      setVehicles(profile.vehicles);
      setVehicleId("");
      setIntakeKm("");
    } catch {
      setVehicleLoadFailed(true);
      toast({ title: t("wo.vehicle_load_error"), variant: "danger" });
    } finally {
      setLoadingVehicles(false);
    }
  }

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
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="wo-intake-title" onKeyDown={keepFocusInside}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card shadow-xl sm:max-w-lg sm:rounded-lg">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="wo-intake-title" className="flex items-center gap-2 font-semibold text-foreground"><ClipboardPlus className="size-4 text-primary" />{t("wo.new")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("wo.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} aria-label={t("wo.close")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
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
                          className="block w-full border-b border-border px-3 py-2 text-left text-sm text-foreground last:border-0 hover:bg-muted focus-visible:outline-hidden focus-visible:bg-muted">
                          {item.full_name}
                        </button>
                      ))}
                    </div>
                  ) : query.trim().length >= 2 ? (
                    <div className="mt-1 rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground" role="status">
                        {searchingCustomers ? t("wo.loading") : customerSearchFailed ? t("wo.customer_search_error") : t("wo.no_customer")}
                      </p>
                      {!searchingCustomers && !customerSearchFailed && !newCustomerOpen ? (
                        <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline" onClick={() => { setNewCustomerName(query.trim()); setNewCustomerOpen(true); }}>
                          <UserPlus className="size-3.5" />{t("wo.add_customer")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              {newCustomerOpen ? (
                <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div>
                    <label htmlFor="wo-new-customer-name" className={LABEL}>{t("wo.customer_name")}</label>
                    <input id="wo-new-customer-name" required maxLength={255} value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} className={FIELD} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="wo-new-customer-phone" className={LABEL}>{t("wo.phone")}</label>
                      <input id="wo-new-customer-phone" type="tel" maxLength={20} pattern="\+?[\d\s()\-]{7,20}" value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor="wo-new-customer-email" className={LABEL}>{t("wo.email")}</label>
                      <input ref={customerEmailRef} id="wo-new-customer-email" type="email" maxLength={255} value={newCustomerEmail} onChange={(event) => setNewCustomerEmail(event.target.value)} className={FIELD} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" disabled={creatingCustomer} onClick={() => setNewCustomerOpen(false)}>{t("wo.cancel")}</Button>
                    <Button type="button" disabled={creatingCustomer || !newCustomerName.trim()} loading={creatingCustomer} leftIcon={creatingCustomer ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} onClick={createCustomer}>{t("wo.save_customer")}</Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="wo-vehicle" className={LABEL}>{t("wo.vehicle")}</label>
              <select id="wo-vehicle" value={vehicleId} onChange={(event) => chooseVehicle(event.target.value)} disabled={!customer || loadingVehicles || vehicles.length === 0} className={FIELD}>
                <option value="">{!customer ? t("wo.choose_customer") : loadingVehicles ? t("wo.loading") : vehicleLoadFailed ? t("wo.vehicle_load_error") : vehicles.length ? t("wo.choose_vehicle") : t("wo.no_vehicles")}</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label} · {vehicle.year}</option>)}
              </select>
              {customer && vehicleLoadFailed && !newVehicleOpen ? (
                <button type="button" className="mt-2 text-xs font-medium text-primary underline" onClick={() => void retryVehicleLoad()}>{t("wo.retry")}</button>
              ) : null}
              {customer && !vehicleLoadFailed && !newVehicleOpen ? (
                <button type="button" disabled={loadingVehicles} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:cursor-wait disabled:opacity-60" onClick={openVehicleForm}>
                  {loadingVehicles ? <Loader2 className="size-3.5 animate-spin" /> : <Car className="size-3.5" />}{loadingVehicles ? t("wo.loading") : t("wo.add_vehicle")}
                </button>
              ) : null}
              {newVehicleOpen ? (
                <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  {vehicleCatalogFailed ? (
                    <p className="text-xs text-destructive" role="alert">
                      {t("wo.vehicle_load_error")} {" "}
                      <button type="button" className="font-medium underline" onClick={() => void openVehicleForm()}>{t("wo.retry")}</button>
                    </p>
                  ) : null}
                  {loadingVehicleCatalog ? <p className="text-xs text-muted-foreground" role="status">{t("wo.loading")}</p> : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="wo-new-vehicle-brand" className={LABEL}>{t("wo.brand")}</label>
                      <select id="wo-new-vehicle-brand" value={newVehicleBrandId} onChange={(event) => { setNewVehicleBrandId(event.target.value); setNewVehicleModelId(""); }} disabled={!vehicleCatalog.length} className={FIELD}>
                        <option value="">{t("wo.choose_brand")}</option>
                        {vehicleCatalog.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="wo-new-vehicle-model" className={LABEL}>{t("wo.model")}</label>
                      <select id="wo-new-vehicle-model" value={newVehicleModelId} onChange={(event) => setNewVehicleModelId(event.target.value)} disabled={!selectedBrand} className={FIELD}>
                        <option value="">{t("wo.choose_model")}</option>
                        {selectedBrand?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="wo-new-vehicle-year" className={LABEL}>{t("wo.year")}</label>
                      <input id="wo-new-vehicle-year" type="number" required min={1900} max={2030} step={1} value={newVehicleYear} onChange={(event) => setNewVehicleYear(event.target.value)} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor="wo-new-vehicle-plate" className={LABEL}>{t("wo.license_plate")}</label>
                      <input id="wo-new-vehicle-plate" maxLength={20} value={newVehiclePlate} onChange={(event) => setNewVehiclePlate(event.target.value)} className={FIELD} />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="wo-new-vehicle-km" className={LABEL}>{t("wo.current_km")}</label>
                      <input id="wo-new-vehicle-km" type="number" min={0} step={1} value={newVehicleKm} onChange={(event) => setNewVehicleKm(event.target.value)} className={FIELD} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" disabled={creatingVehicle} onClick={() => setNewVehicleOpen(false)}>{t("wo.cancel")}</Button>
                    <Button type="button" disabled={creatingVehicle || loadingVehicleCatalog || !newVehicleBrandId || !newVehicleModelId || !Number.isInteger(Number(newVehicleYear)) || Number(newVehicleYear) < 1900 || Number(newVehicleYear) > 2030 || !Number.isInteger(Number(newVehicleKm)) || Number(newVehicleKm) < 0} loading={creatingVehicle} leftIcon={creatingVehicle ? <Loader2 className="size-4 animate-spin" /> : <Car className="size-4" />} onClick={createVehicle}>{t("wo.save_vehicle")}</Button>
                  </div>
                </div>
              ) : null}
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
