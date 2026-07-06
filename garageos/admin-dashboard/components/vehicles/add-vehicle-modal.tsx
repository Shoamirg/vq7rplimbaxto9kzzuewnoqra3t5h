"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Car, Loader2, X } from "lucide-react";
import { Button } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";

type Model = { id: string; name: string };
type Brand = { id: string; name: string; models: Model[] };

const FIELD =
  "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const LABEL = "block text-xs font-medium text-muted-foreground mb-1";

// Add a vehicle to a customer. Brand→model picker sourced from /reference.
export function AddVehicleModal({
  customerId,
  onClose,
  onAdded,
}: {
  customerId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useI18n();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState<string>("");
  const [plate, setPlate] = useState("");
  const [km, setKm] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientFetch<Brand[]>("/reference/vehicle-models")
      .then(setBrands)
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, []);

  const models = useMemo(
    () => brands.find((b) => b.id === brandId)?.models ?? [],
    [brands, brandId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!modelId) {
      setError(t("vehicles.add.need_model"));
      return;
    }
    setSaving(true);
    try {
      await clientFetch(`/customers/${customerId}/vehicles`, {
        method: "POST",
        body: JSON.stringify({
          vehicle_model_id: modelId,
          year: Number(year) || new Date().getFullYear(),
          license_plate: plate.trim() || null,
          current_km: Number(km) || 0,
          color: color.trim() || null,
        }),
      });
      onAdded();
    } catch {
      setError(t("vehicles.add.error"));
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Car className="size-5 text-primary" /> {t("vehicles.add.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <p className="p-5 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {t("vehicles.add.loading")}</p>
        ) : (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="veh-brand">{t("vehicles.add.brand")}</label>
                <select id="veh-brand" className={FIELD} value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(""); }}>
                  <option value="">{t("vehicles.add.brand_ph")}</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="veh-model">{t("vehicles.add.model")}</label>
                <select id="veh-model" className={FIELD} value={modelId} disabled={!brandId} onChange={(e) => setModelId(e.target.value)}>
                  <option value="">{t("vehicles.add.model_ph")}</option>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="veh-year">{t("vehicles.add.year")}</label>
                <input id="veh-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2020" className={FIELD} />
              </div>
              <div>
                <label className={LABEL} htmlFor="veh-km">{t("vehicles.add.km")}</label>
                <input id="veh-km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="45000" className={FIELD} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="veh-plate">{t("vehicles.add.plate")}</label>
                <input id="veh-plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={t("vehicles.add.plate_ph")} className={FIELD} />
              </div>
              <div>
                <label className={LABEL} htmlFor="veh-color">{t("vehicles.add.color")}</label>
                <input id="veh-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder={t("vehicles.add.color_ph")} className={FIELD} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="submit" size="sm" disabled={saving || loading} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <Car className="size-4" />}>
            {saving ? t("vehicles.add.saving") : t("vehicles.add.save")}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
