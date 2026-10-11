"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Siren, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { CaseDetail, CaseList, Customer360 } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const KEY = "garageos:inbox-case:uncertain:v1";
const FIELD = "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
type CaseType = "emergency" | "support" | "towing" | "warranty" | "vip";
type Severity = "critical" | "high" | "medium" | "low";
type Target = { customerId: string; vehicleId: string | null; attemptedAt: string; title: string; description: string; caseType: CaseType; severity: Severity; locationText: string | null };

function loadTarget(): Target | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<Target> | null;
    if (value && typeof value.customerId === "string" && typeof value.attemptedAt === "string" && Number.isFinite(Date.parse(value.attemptedAt))
      && typeof value.title === "string" && typeof value.description === "string"
      && ["emergency", "support", "towing", "warranty", "vip"].includes(value.caseType ?? "")
      && ["critical", "high", "medium", "low"].includes(value.severity ?? "")) {
      return { customerId: value.customerId, vehicleId: typeof value.vehicleId === "string" ? value.vehicleId : null,
        attemptedAt: value.attemptedAt, title: value.title, description: value.description,
        caseType: value.caseType as CaseType, severity: value.severity as Severity,
        locationText: typeof value.locationText === "string" ? value.locationText : null };
    }
  } catch { /* Invalid tab storage cannot authorize a replay. */ }
  return null;
}

function clearTarget() {
  try { window.sessionStorage.removeItem(KEY); return true; } catch { return false; }
}

export function NewInboxCaseModal({
  preset, onClose,
}: {
  preset: { customerId: string; customerName: string; vehicleId?: string; vehicleLabel?: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer360 | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState(false);
  const [retryCustomer, setRetryCustomer] = useState(0);
  const [vehicleId, setVehicleId] = useState(preset.vehicleId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("emergency");
  const [severity, setSeverity] = useState<Severity>("high");
  const [locationText, setLocationText] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [uncertain, setUncertain] = useState<Target | null>(loadTarget);
  const [uncertainResult, setUncertainResult] = useState<"found" | "not_found" | null>(null);
  const [foundCase, setFoundCase] = useState<CaseDetail | null>(null);
  const [createdCase, setCreatedCase] = useState<CaseDetail | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setCustomerLoading(true); setCustomerError(false);
    clientFetch<Customer360>(`/customers/${preset.customerId}`)
      .then((data) => {
        if (!active) return;
        setCustomer(data);
        if (preset.vehicleId && !data.vehicles.some((vehicle) => vehicle.id === preset.vehicleId)) setVehicleId("");
      })
      .catch(() => { if (active) setCustomerError(true); })
      .finally(() => { if (active) setCustomerLoading(false); });
    return () => { active = false; };
  }, [preset.customerId, preset.vehicleId, retryCustomer]);

  async function findMatchingCase(target: Target) {
    const params = new URLSearchParams({ status: "active", type: target.caseType, customer_id: target.customerId, q: target.title, limit: "100" });
    let offset = 0;
    const attemptedAt = Date.parse(target.attemptedAt) - 5 * 60_000;
    while (true) {
      params.set("offset", String(offset));
      const page = await clientFetch<CaseList>(`/cases?${params}`);
      for (const item of page.items) {
        const createdAt = Date.parse(item.created_at);
        if (item.title !== target.title || item.case_type !== target.caseType || item.severity !== target.severity
          || !Number.isFinite(createdAt) || createdAt < attemptedAt) continue;
        const detail = await clientFetch<CaseDetail>(`/cases/${item.id}`);
        if (detail.customer_id === target.customerId && detail.vehicle_id === target.vehicleId
          && detail.title === target.title && detail.description === target.description
          && detail.case_type === target.caseType && detail.severity === target.severity
          && detail.location_text === target.locationText) return detail;
      }
      if (offset + page.items.length >= page.total || page.items.length === 0) return null;
      offset += page.items.length;
    }
  }

  async function reconcile() {
    if (!uncertain || checkingRef.current) return;
    checkingRef.current = true; setChecking(true); setCheckFailed(false); setUncertainResult(null); setFoundCase(null);
    try {
      const found = await findMatchingCase(uncertain);
      if (found) {
        setFoundCase(found); setUncertainResult("found"); clearTarget();
      } else setUncertainResult("not_found");
    } catch { setCheckFailed(true); }
    finally { checkingRef.current = false; setChecking(false); }
  }

  function allowSeparateCase() {
    if (uncertainResult !== "not_found" || !clearTarget()) { setCheckFailed(true); return; }
    setUncertain(null); setUncertainResult(null); setFoundCase(null); setCheckFailed(false);
  }

  async function save() {
    if (!customer || !title.trim() || !description.trim() || savingRef.current || uncertain) return;
    savingRef.current = true; setSaving(true);
    const target: Target = { customerId: preset.customerId, vehicleId: vehicleId || null,
      attemptedAt: new Date().toISOString(), title: title.trim(), description: description.trim(),
      caseType, severity, locationText: locationText.trim() || null };
    try { window.sessionStorage.setItem(KEY, JSON.stringify(target)); }
    catch {
      toast({ title: t("message.case_store_failed"), variant: "danger" });
      savingRef.current = false; setSaving(false); return;
    }
    try {
      const created = await clientFetch<CaseDetail>("/cases", { method: "POST", body: JSON.stringify({
        customer_id: target.customerId, vehicle_id: target.vehicleId, title: target.title,
        description: target.description, case_type: target.caseType, severity: target.severity,
        location_text: target.locationText, channel: "inbox",
      }) });
      clearTarget(); setCreatedCase(created);
    } catch (error) {
      if ((error instanceof ClientApiError && (error.status === 408 || error.status >= 500)) || !(error instanceof ClientApiError)) {
        setUncertain(target); setUncertainResult(null);
      } else {
        clearTarget();
        toast({ title: error instanceof ClientApiError && error.status === 401 ? t("message.case_auth")
          : error instanceof ClientApiError && error.status === 403 ? t("message.case_denied")
            : t("message.case_create_failed"), variant: "danger" });
      }
    } finally { savingRef.current = false; setSaving(false); }
  }

  const canSave = Boolean(customer) && !customerLoading && !customerError && Boolean(title.trim()) && Boolean(description.trim()) && !saving && !uncertain;

  return <Dialog open onOpenChange={(open) => { if (!open && !saving && !checking) onClose(); }}>
    <DialogContent size="lg" hideClose noPadding aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_select]:min-h-11">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <DialogTitle className="flex items-center gap-2 text-base font-bold"><Siren className="size-4 text-red-600" />{t("message.case_new")}</DialogTitle>
        <button type="button" onClick={onClose} disabled={saving || checking} className="min-h-11 min-w-11 rounded-lg hover:bg-muted" aria-label={t("common.close")}><X className="mx-auto size-4" /></button>
      </div>
      <div className="space-y-4 p-5">
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("message.case_service_notice")}</p>
        {customerLoading ? <p role="status" className="text-sm">{t("appointment.loading")}</p> : customerError ? <p role="alert" className="text-sm">{t("message.case_customer_unavailable")} <button className="underline" onClick={() => setRetryCustomer((value) => value + 1)}>{t("intake.retry")}</button></p> : (
          <p className="text-sm"><span className="font-semibold">{t("work.customer")}:</span> {customer?.full_name ?? preset.customerName}</p>
        )}
        {createdCase && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p>{t("message.case_created")}</p><Link className="mt-1 inline-block underline" href={`/operations?case=${createdCase.id}`} onClick={onClose}>{t("message.case_open_created", { code: createdCase.code })}</Link>
        </div>}
        {uncertain ? <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>{uncertainResult === "found" ? t("message.case_outcome_found") : uncertainResult === "not_found" ? t("message.case_outcome_not_found") : t("message.case_outcome_uncertain")}</p>
          {checkFailed && <p>{t("message.case_check_failed")}</p>}
          {foundCase && <Link className="underline" href={`/operations?case=${foundCase.id}`} onClick={onClose}>{t("message.case_open_created", { code: foundCase.code })}</Link>}
          {uncertainResult !== "found" && <Button variant="outline" size="sm" disabled={checking} onClick={() => void reconcile()}>{checking ? t("message.case_checking") : t("message.case_check")}</Button>}
          {uncertainResult === "not_found" && <Button variant="ghost" size="sm" onClick={allowSeparateCase}>{t("message.case_allow_separate")}</Button>}
        </div> : <fieldset disabled={saving || customerLoading || customerError} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <label className="block text-sm"><span className="font-semibold">{t("message.case_title")}</span><input className={`${FIELD} mt-1`} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span className="font-semibold">{t("message.case_type")}</span><select className={`${FIELD} mt-1`} value={caseType} onChange={(event) => setCaseType(event.target.value as CaseType)}>
              {(["emergency", "support", "towing", "warranty", "vip"] as const).map((value) => <option key={value} value={value}>{t(`ops.type.${value}`)}</option>)}
            </select></label>
            <label className="block text-sm"><span className="font-semibold">{t("ops.severity")}</span><select className={`${FIELD} mt-1`} value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>
              {(["critical", "high", "medium", "low"] as const).map((value) => <option key={value} value={value}>{t(`ops.severity.${value}`)}</option>)}
            </select></label>
          </div>
          <label className="block text-sm"><span className="font-semibold">{t("message.case_description")}</span><textarea className={`${FIELD} mt-1 resize-y`} minLength={1} maxLength={8000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="block text-sm"><span className="font-semibold">{t("message.case_location")}</span><input className={`${FIELD} mt-1`} maxLength={255} value={locationText} onChange={(event) => setLocationText(event.target.value)} /></label>
          {customer?.vehicles.length ? <label className="block text-sm"><span className="font-semibold">{t("work.vehicle")}</span><select className={`${FIELD} mt-1`} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
            <option value="">{t("message.case_no_vehicle")}</option>{customer.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
          </select></label> : <p className="text-sm text-muted-foreground">{t("message.case_no_vehicle")}</p>}
        </fieldset>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button variant="ghost" size="sm" disabled={saving || checking} onClick={onClose}>{t("common.cancel")}</Button>
        {!uncertain && !createdCase && <Button size="sm" disabled={!canSave} onClick={() => void save()} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <Siren className="size-4" />}>
          {saving ? t("message.case_saving") : t("message.case_create")}
        </Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
