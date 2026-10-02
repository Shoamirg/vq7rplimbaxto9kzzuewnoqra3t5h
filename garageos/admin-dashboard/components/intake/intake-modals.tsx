"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { CustomerListItem, RegisteredVehicle, VehicleCatalog } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { CustomerPicker } from "./customer-picker";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function NewCustomerModal({ onClose, onCreated }: {
  onClose: () => void; onCreated: (customer: CustomerListItem) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const customer = await clientFetch<CustomerListItem>("/customers", { method: "POST", body: JSON.stringify({
        full_name: name.trim(), phone: phone.trim(), email: email.trim() || null, address: address.trim() || null,
      }) });
      onCreated(customer); onClose();
    } catch (err) {
      setError(t(err instanceof ClientApiError && err.status === 409 ? "intake.duplicate_customer" : "intake.failed"));
    } finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent size="md" hideClose className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
      <button type="button" onClick={onClose} disabled={saving} aria-label={t("common.close")} className="absolute right-4 top-4 rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><X className="size-4" /></button>
      <DialogHeader><DialogTitle>{t("intake.new_customer")}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm space-y-1"><span>{t("intake.full_name")}</span><input className={FIELD} autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} autoComplete="name" /></label>
        <label className="block text-sm space-y-1"><span>{t("intake.phone")}</span><input className={FIELD} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={7} maxLength={20} autoComplete="tel" /></label>
        <label className="block text-sm space-y-1"><span>{t("intake.email")}</span><input className={FIELD} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" /></label>
        <label className="block text-sm space-y-1"><span>{t("intake.address")}</span><input className={FIELD} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} autoComplete="street-address" /></label>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={saving || !name.trim() || !phone.trim()}>{t(saving ? "intake.saving" : "intake.save")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function NewVehicleModal({ onClose, onCreated, presetCustomer }: {
  onClose: () => void; onCreated: (vehicle: RegisteredVehicle) => void;
  presetCustomer?: { id: string; full_name: string };
}) {
  const { t } = useI18n();
  const [customer, setCustomer] = useState(presetCustomer ?? null);
  const [catalog, setCatalog] = useState<VehicleCatalog | null>(null);
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setLoading(true); setLoadError(false);
    clientFetch<VehicleCatalog>("/vehicles/catalog").then((data) => { if (active) setCatalog(data); })
      .catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const models = catalog?.brands.find((brand) => brand.id === brandId)?.models ?? [];
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!customer || saving) return;
    setSaving(true); setError("");
    try {
      const vehicle = await clientFetch<RegisteredVehicle>("/vehicles", { method: "POST", body: JSON.stringify({
        customer_id: customer.id, vehicle_model_id: modelId, year, license_plate: plate.trim() || null,
        vin: vin.trim() || null, current_km: mileage,
      }) });
      onCreated(vehicle); onClose();
    } catch (err) { setError(t(err instanceof ClientApiError && err.status === 409 ? "intake.duplicate_vehicle" : "intake.failed")); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent size="md" hideClose className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
      <button type="button" onClick={onClose} disabled={saving} aria-label={t("common.close")} className="absolute right-4 top-4 rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><X className="size-4" /></button>
      <DialogHeader><DialogTitle>{t("intake.new_vehicle")}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="text-sm space-y-1"><p>{t("work.customer")}</p>{customer ? <p className="flex items-center justify-between rounded-lg bg-muted p-2">{customer.full_name}{!presetCustomer ? <button type="button" onClick={() => setCustomer(null)}>{t("invoice.change")}</button> : null}</p> : <CustomerPicker id="vehicle-customer" onSelect={setCustomer} />}</div>
        {loadError ? <p role="alert" className="text-sm text-red-600">{t("intake.load_failed")} <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>{t("intake.retry")}</button></p> : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1"><span>{t("intake.brand")}</span><select className={FIELD} value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(""); }} required disabled={loading || loadError}><option value="">{t(loading ? "crm.search_loading" : "intake.select_brand")}</option>{catalog?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label className="text-sm space-y-1"><span>{t("intake.model")}</span><select className={FIELD} value={modelId} onChange={(e) => setModelId(e.target.value)} required disabled={!brandId}><option value="">{t("intake.select_model")}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <label className="text-sm space-y-1"><span>{t("intake.year")}</span><input className={FIELD} type="number" min={1900} max={new Date().getFullYear() + 1} step={1} value={year} onChange={(e) => setYear(Number(e.target.value))} required /></label>
          <label className="text-sm space-y-1"><span>{t("intake.mileage")}</span><input className={FIELD} type="number" min={0} step={1} value={mileage} onChange={(e) => setMileage(Number(e.target.value))} required /></label>
          <label className="text-sm space-y-1"><span>{t("intake.plate")}</span><input className={FIELD} value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={20} /></label>
          <label className="text-sm space-y-1"><span>{t("intake.vin")}</span><input className={FIELD} value={vin} onChange={(e) => setVin(e.target.value)} minLength={11} maxLength={17} /></label>
        </div>
        <p className="text-xs text-muted-foreground">{t("intake.identifier_hint")}</p>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={saving || loading || loadError || !customer || !modelId || (!plate.trim() && !vin.trim())}>{t(saving ? "intake.saving" : "intake.save")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
