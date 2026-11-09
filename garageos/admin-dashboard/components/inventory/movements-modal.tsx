"use client";

import { useEffect, useState } from "react";
import { X, ArrowDownRight, ArrowUpRight, History, PackageCheck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Badge } from "@garageos/design-system";
import { clientFetch } from "@/lib/api/client";
import type { InventoryMovement, PartItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

interface MovementsModalProps {
  part?: PartItem | null;
  onClose: () => void;
}

export function MovementsModal({ part, onClose }: MovementsModalProps) {
  const { fmt } = useI18n();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const url = part ? `/inventory/parts/${part.id}/movements` : "/inventory/movements?limit=100";

    clientFetch<InventoryMovement[]>(url)
      .then((data) => {
        if (active) setMovements(data);
      })
      .catch(() => {
        if (active) setError("Harakatlar tarixini yuklab boʻlmadi");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [part]);

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "purchase":
        return <Badge variant="success">Kirim</Badge>;
      case "sale":
        return <Badge variant="info">Sotuv</Badge>;
      case "loss":
        return <Badge variant="danger">Spisanie</Badge>;
      case "return":
        return <Badge variant="warning">Qaytarish</Badge>;
      default:
        return <Badge variant="neutral">Tuzatish</Badge>;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg" hideClose className="max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg hover:bg-muted text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary z-10"
        >
          <X className="size-4" />
        </button>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <span>
              {part ? `${part.name} — Harakatlar tarixi` : "Ombor boʻyicha umumiy harakatlar tarixi"}
            </span>
          </DialogTitle>
          {part && (
            <p className="text-xs text-muted-foreground mt-0.5">
              SKU: <span className="font-mono font-medium text-foreground">{part.sku}</span> | Hozirgi qoldiq:{" "}
              <span className="font-bold text-foreground">
                {part.quantity_in_stock} {part.unit}
              </span>
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-[300px] mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
              <p className="text-sm">Harakatlar tarixi yuklanmoqda...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30">
              <AlertTriangle className="size-5 mx-auto mb-1 text-red-500" />
              {error}
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PackageCheck className="size-10 stroke-1 mb-2 text-muted-foreground/60" />
              <p className="text-sm font-medium">Hozircha hech qanday harakat qayd etilmagan</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Kirim yoki spisanie qilinganda bu yerda koʻrinadi</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Sana</th>
                    <th className="py-2.5 px-3">Turi</th>
                    <th className="py-2.5 px-3 text-right">Miqdor</th>
                    <th className="py-2.5 px-3 text-right">Birlik tannarxi</th>
                    <th className="py-2.5 px-3">Hujjat / Asos</th>
                    <th className="py-2.5 px-3">Izoh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((m) => {
                    const isPositive = m.quantity > 0;
                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                          {fmt.date(m.created_at)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getMovementBadge(m.movement_type)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {isPositive ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap text-muted-foreground">
                          {fmt.money(m.unit_cost, "UZS")}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">
                          {m.reference_invoice_id ? (
                            <span className="font-mono text-primary font-medium">Invoys toʻlovi</span>
                          ) : m.reference_appointment_id ? (
                            <span className="font-mono text-primary font-medium">Qabul #</span>
                          ) : (
                            <span>Qoʻlda kiritilgan</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-foreground/80 max-w-[200px] truncate" title={m.notes || ""}>
                          {m.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
