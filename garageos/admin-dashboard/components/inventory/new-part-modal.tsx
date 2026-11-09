"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, useToast } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { PartItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1";

export const CATEGORIES = [
  { value: "oils_fluids", labelUz: "Moylar va suyuqliklar", labelRu: "Масла и жидкости", labelEn: "Oils & Fluids" },
  { value: "filters", labelUz: "Filtrlar", labelRu: "Фильтры", labelEn: "Filters" },
  { value: "brakes", labelUz: "Tormoz tizimi", labelRu: "Тормозная система", labelEn: "Brakes" },
  { value: "suspension", labelUz: "Xodovoy va podveska", labelRu: "Ходовая и подвеска", labelEn: "Suspension" },
  { value: "electrical", labelUz: "Elektr va datchiklar", labelRu: "Электрика и датчики", labelEn: "Electrical" },
  { value: "engine", labelUz: "Dvigatel qismlari", labelRu: "Детали двигателя", labelEn: "Engine" },
  { value: "tires_wheels", labelUz: "Shinalar va disklar", labelRu: "Шины и диски", labelEn: "Tires & Wheels" },
  { value: "accessories", labelUz: "Aksessuarlar", labelRu: "Аксессуары", labelEn: "Accessories" },
  { value: "other", labelUz: "Boshqa qismlar", labelRu: "Прочее", labelEn: "Other" },
];

export const UNITS = [
  { value: "dona", label: "Dona (шт)" },
  { value: "litr", label: "Litr (л)" },
  { value: "metr", label: "Metr (м)" },
  { value: "komplekt", label: "Komplekt (комплект)" },
  { value: "kg", label: "Kg (кг)" },
];

export function NewPartModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (part: PartItem) => void;
}) {
  const { locale } = useI18n();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("other");
  const [unit, setUnit] = useState("dona");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [minStockLevel, setMinStockLevel] = useState("2");
  const [costPrice, setCostPrice] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [location, setLocation] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function generateSku() {
    const prefix = category.substring(0, 3).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    setSku(`${prefix}-${random}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const cost = parseFloat(costPrice) || 0;
    const retail = parseFloat(retailPrice) || 0;
    const qty = parseFloat(initialQuantity) || 0;
    const minLvl = parseFloat(minStockLevel) || 0;

    if (!name.trim() || !sku.trim()) {
      setError("Nomi va SKU kodi to'ldirilishi shart");
      return;
    }

    if (retail < cost) {
      if (!confirm("Diqqat: Sotish narxi tannarxdan arzon kiritildi. Davom ettirasizmi?")) {
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      const created = await clientFetch<PartItem>("/inventory/parts", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim(),
          oem_number: oemNumber.trim() || null,
          barcode: barcode.trim() || null,
          category,
          unit,
          cost_price: cost,
          retail_price: retail,
          quantity_in_stock: qty,
          min_stock_level: minLvl,
          location: location.trim() || null,
          supplier_name: supplierName.trim() || null,
          supplier_phone: supplierPhone.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      toast({
        title: "Tovar qo'shildi",
        description: `${created.name} (${created.sku}) omborga muvaffaqiyatli kiritildi.`,
      });

      onCreated(created);
      onClose();
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 409) {
        setError(`"${sku}" SKU kodli tovar allaqachon ro'yxatdan o'tgan.`);
      } else {
        setError("Tovarni saqlashda xatolik yuz berdi. Qaytadan urinib ko'ring.");
      }
    } finally {
      setSaving(false);
    }
  }

  const getCategoryLabel = (cat: typeof CATEGORIES[0]) => {
    if (locale === "ru") return cat.labelRu;
    if (locale === "en") return cat.labelEn;
    return cat.labelUz;
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent size="lg" hideClose className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Yopish"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg hover:bg-muted text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" />
        </button>

        <DialogHeader>
          <DialogTitle>Yangi ehtiyot qism qoʻshish</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL}>
                Tovar / Ehtiyot qism nomi *
              </label>
              <input
                className={FIELD}
                required
                placeholder="Masalan: Motul 5W-40 4L, Old tormoz kolodkasi..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  SKU / Artikul kodi *
                </label>
                <button
                  type="button"
                  onClick={generateSku}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Sparkles className="size-3" />
                  Generatsiya
                </button>
              </div>
              <input
                className={FIELD}
                required
                placeholder="SKU-10024"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className={LABEL}>OEM zavod raqami</label>
              <input
                className={FIELD}
                placeholder="Masalan: 2108-3501080"
                value={oemNumber}
                onChange={(e) => setOemNumber(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Kategoriya</label>
              <select
                className={FIELD}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>Oʻlchov birligi</label>
              <select
                className={FIELD}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>Tannarx (UZS) *</label>
              <input
                type="number"
                min="0"
                step="500"
                required
                className={FIELD}
                placeholder="150000"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Sotish narxi (UZS) *</label>
              <input
                type="number"
                min="0"
                step="500"
                required
                className={FIELD}
                placeholder="200000"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Boshlangʻich qoldiq miqdori</label>
              <input
                type="number"
                min="0"
                step="any"
                className={FIELD}
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Minimal chegara (ogohlantirish uchun)</label>
              <input
                type="number"
                min="0"
                step="any"
                className={FIELD}
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Shtrix-kod (Barcode)</label>
              <input
                className={FIELD}
                placeholder="Skaner yoki raqam..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Ombordagi joylashuvi (Polka/Sektor)</label>
              <input
                className={FIELD}
                placeholder="A-3, 2-tokcha..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Yetkazib beruvchi (Postavshik)</label>
              <input
                className={FIELD}
                placeholder="MChJ AvtoQismlar..."
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL}>Postavshik telefoni</label>
              <input
                type="tel"
                className={FIELD}
                placeholder="+998 90 123 45 67"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL}>Qoʻshimcha tavsif / Izoh</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary resize-none"
                placeholder="Xususiyatlari, mos keladigan avtomobillar..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saqlanmoqda..." : "Saqlash va qoʻshish"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
