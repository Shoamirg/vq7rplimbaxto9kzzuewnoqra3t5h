"use client";

import { useState } from "react";
import { X, ArrowDownRight, ArrowUpRight, AlertOctagon, RefreshCcw } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, useToast } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { PartItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary";
const LABEL = "block text-xs font-semibold text-muted-foreground mb-1";

interface AdjustStockModalProps {
  part: PartItem;
  onClose: () => void;
  onUpdated: (updatedPart: PartItem) => void;
}

export function AdjustStockModal({ part, onClose, onUpdated }: AdjustStockModalProps) {
  const { fmt } = useI18n();
  const { toast } = useToast();

  const [movementType, setMovementType] = useState<"purchase" | "loss" | "adjustment" | "return">("purchase");
  const [quantity, setQuantity] = useState("1");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"add" | "sub">("add");
  const [unitCost, setUnitCost] = useState(String(part.cost_price || ""));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const qtyNumber = parseFloat(quantity) || 0;
  let simulatedStock = part.quantity_in_stock;

  if (movementType === "purchase" || movementType === "return") {
    simulatedStock = part.quantity_in_stock + qtyNumber;
  } else if (movementType === "loss") {
    simulatedStock = part.quantity_in_stock - qtyNumber;
  } else if (movementType === "adjustment") {
    simulatedStock = adjustmentDirection === "add" ? part.quantity_in_stock + qtyNumber : part.quantity_in_stock - qtyNumber;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (qtyNumber <= 0) {
      setError("Miqdor 0 dan katta boʻlishi kerak");
      return;
    }

    if (simulatedStock < 0) {
      setError(`Omborda yetarli qoldiq mavjud emas. Hozirgi qoldiq: ${part.quantity_in_stock} ${part.unit}`);
      return;
    }

    setSaving(true);
    setError("");

    let finalQuantity = qtyNumber;
    if (movementType === "adjustment" && adjustmentDirection === "sub") {
      finalQuantity = -qtyNumber;
    }

    try {
      const updated = await clientFetch<PartItem>(`/inventory/parts/${part.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          movement_type: movementType,
          quantity: finalQuantity,
          unit_cost: movementType === "purchase" && unitCost ? parseFloat(unitCost) : undefined,
          notes: reason.trim() || undefined,
        }),
      });

      toast({
        title: "Qoldiq yangilandi",
        description: `${part.name}: yangi qoldiq ${updated.quantity_in_stock} ${part.unit}`,
      });

      onUpdated(updated);
      onClose();
    } catch (err) {
      if (err instanceof ClientApiError && err.detail) {
        setError(err.detail);
      } else {
        setError("Qoldiqni yangilashda xatolik yuz berdi. Qaytadan urinib koʻring.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent size="md" hideClose aria-describedby={undefined}>
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
          <DialogTitle>Ombor qoldigʻini toʻgʻrilash</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/40 p-3 mt-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{part.name}</span>
            <span className="text-xs font-mono text-muted-foreground">{part.sku}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Hozirgi qoldiq:</span>
            <span className="font-bold text-foreground">
              {part.quantity_in_stock} {part.unit}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Amaldagi tannarx:</span>
            <span>{fmt.money(part.cost_price, "UZS")}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <div>
            <label className={LABEL}>Harakat turi</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementType("purchase")}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  movementType === "purchase"
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "border-border hover:bg-muted text-muted-foreground"
                }`}
              >
                <ArrowDownRight className="size-4 text-emerald-600" />
                <span>Kirim (Yangi partiya)</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementType("loss")}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  movementType === "loss"
                    ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-semibold"
                    : "border-border hover:bg-muted text-muted-foreground"
                }`}
              >
                <ArrowUpRight className="size-4 text-rose-600" />
                <span>Spisanie / Zarar</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementType("adjustment")}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  movementType === "adjustment"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border hover:bg-muted text-muted-foreground"
                }`}
              >
                <RefreshCcw className="size-4 text-primary" />
                <span>Inventarizatsiya</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementType("return")}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  movementType === "return"
                    ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-semibold"
                    : "border-border hover:bg-muted text-muted-foreground"
                }`}
              >
                <AlertOctagon className="size-4 text-amber-600" />
                <span>Mijozdan qaytish</span>
              </button>
            </div>
          </div>

          {movementType === "adjustment" && (
            <div>
              <label className={LABEL}>Yoʻnalish</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection("add")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${
                    adjustmentDirection === "add"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Qoʻshish (+)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection("sub")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${
                    adjustmentDirection === "sub"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Kamaytirish (-)
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Miqdor ({part.unit}) *</label>
              <input
                type="number"
                min="0.01"
                step="any"
                required
                className={FIELD}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {movementType === "purchase" ? (
              <div>
                <label className={LABEL}>Yangi partiya tannarxi (UZS)</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  className={FIELD}
                  placeholder={String(part.cost_price)}
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className={LABEL}>Kutilayotgan yangi qoldiq</label>
                <div className={`min-h-11 rounded-lg border border-border px-3 py-2.5 text-sm font-bold flex items-center ${simulatedStock < 0 ? "text-red-600 bg-red-50 dark:bg-red-950/20" : "text-foreground bg-muted/20"}`}>
                  {simulatedStock} {part.unit}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Harakat sababi yoki izoh *</label>
            <input
              required
              className={FIELD}
              placeholder="Masalan: Postavshikdan yangi partiya, brak sababli spisanie, inventarizatsiya..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={saving || simulatedStock < 0}>
              {saving ? "Saqlanmoqda..." : "Tasdiqlash"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
