"use client";

import { useState, useTransition } from "react";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Plus,
  Search,
  History,
  SlidersHorizontal,
  ArrowUpDown,
  Layers,
  MapPin,
  Barcode,
  Boxes,
  CheckCircle2,
} from "lucide-react";
import { Badge, Button, Card, CardContent } from "@garageos/design-system";
import { clientFetch } from "@/lib/api/client";
import type { InventorySummary, PartItem, PartsListResponse } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { CATEGORIES, NewPartModal } from "./new-part-modal";
import { AdjustStockModal } from "./adjust-stock-modal";
import { MovementsModal } from "./movements-modal";

interface InventoryViewProps {
  initialSummary: InventorySummary;
  initialParts: PartsListResponse;
}

export function InventoryView({ initialSummary, initialParts }: InventoryViewProps) {
  const { t, fmt, locale } = useI18n();
  const [, startTransition] = useTransition();

  const [summary, setSummary] = useState<InventorySummary>(initialSummary);
  const [parts, setParts] = useState<PartItem[]>(initialParts.items);
  const [total, setTotal] = useState<number>(initialParts.total);
  const [offset, setOffset] = useState<number>(initialParts.offset);
  const limit = initialParts.limit || 50;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [adjustPart, setAdjustPart] = useState<PartItem | null>(null);
  const [historyPart, setHistoryPart] = useState<PartItem | null | undefined>(undefined);
  // undefined = closed, null = all movements, PartItem = specific part

  // Calculated metrics
  const expectedProfit = Math.max(0, summary.total_retail_value - summary.total_cost_value);
  const marginPercentage =
    summary.total_cost_value > 0
      ? ((summary.total_retail_value - summary.total_cost_value) / summary.total_cost_value) * 100
      : 0;

  async function fetchParts(opts?: {
    search?: string;
    category?: string;
    lowStock?: boolean;
    newOffset?: number;
  }) {
    setLoading(true);
    const search = opts?.search !== undefined ? opts.search : searchQuery;
    const cat = opts?.category !== undefined ? opts.category : selectedCategory;
    const low = opts?.lowStock !== undefined ? opts.lowStock : lowStockOnly;
    const off = opts?.newOffset !== undefined ? opts.newOffset : offset;

    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (cat && cat !== "all") q.set("category", cat);
    if (low) q.set("low_stock_only", "true");
    q.set("offset", String(off));
    q.set("limit", String(limit));

    try {
      const res = await clientFetch<PartsListResponse>(`/inventory/parts?${q.toString()}`);
      setParts(res.items);
      setTotal(res.total);
      setOffset(res.offset);
    } catch (err) {
      console.error("Failed to load parts", err);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSummary() {
    try {
      const updated = await clientFetch<InventorySummary>("/inventory/summary");
      setSummary(updated);
    } catch (err) {
      console.error("Failed to refresh summary", err);
    }
  }

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    startTransition(() => {
      fetchParts({ search: val, newOffset: 0 });
    });
  }

  function handleCategorySelect(cat: string) {
    setSelectedCategory(cat);
    fetchParts({ category: cat, newOffset: 0 });
  }

  function handleToggleLowStock() {
    const nextVal = !lowStockOnly;
    setLowStockOnly(nextVal);
    fetchParts({ lowStock: nextVal, newOffset: 0 });
  }

  function handlePartCreated(newPart: PartItem) {
    setParts((prev) => [newPart, ...prev]);
    setTotal((prev) => prev + 1);
    refreshSummary();
  }

  function handlePartUpdated(updatedPart: PartItem) {
    setParts((prev) => prev.map((p) => (p.id === updatedPart.id ? updatedPart : p)));
    refreshSummary();
  }

  const getCategoryTitle = (val: string) => {
    const found = CATEGORIES.find((c) => c.value === val);
    if (!found) return val;
    if (locale === "ru") return found.labelRu;
    if (locale === "en") return found.labelEn;
    return found.labelUz;
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* ─── Top Header & Primary Actions ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Boxes className="size-7 text-primary" />
            {t("inventory.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("inventory.desc")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<History className="size-4" />}
            onClick={() => setHistoryPart(null)}
          >
            {t("inventory.action.movements")}
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            {t("inventory.action.new_part")}
          </Button>
        </div>
      </div>

      {/* ─── 4 Executive KPI Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total SKU & Units */}
        <Card className="border border-border bg-card shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("inventory.kpi.total_parts")}
              </span>
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Package className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {summary.total_parts}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.total_stock_count} {t("inventory.kpi.total_items").toLowerCase()}
            </p>
          </CardContent>
        </Card>

        {/* Metric 2: Low Stock Warning */}
        <Card
          onClick={handleToggleLowStock}
          className={`border shadow-xs cursor-pointer transition-colors ${
            lowStockOnly
              ? "border-amber-500 bg-amber-500/10"
              : summary.low_stock_count > 0
              ? "border-amber-300 dark:border-amber-900 bg-card hover:border-amber-400"
              : "border-border bg-card"
          }`}
        >
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("inventory.kpi.low_stock")}
              </span>
              <div
                className={`grid size-8 place-items-center rounded-lg ${
                  summary.low_stock_count > 0
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-bold tracking-tight ${
                summary.low_stock_count > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
              }`}
            >
              {summary.low_stock_count}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {summary.low_stock_count > 0 ? (
                <span>Filtrni yoqish uchun bosing</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Qoldiqlar yetarli
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Metric 3: Total Warehouse Cost Valuation */}
        <Card className="border border-border bg-card shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("inventory.kpi.cost_value")}
              </span>
              <div className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Layers className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground truncate">
              {fmt.money(summary.total_cost_value, "UZS")}
            </div>
            <p className="text-xs text-muted-foreground">Ombordagi tovarlar tannarxi</p>
          </CardContent>
        </Card>

        {/* Metric 4: Expected Profit & Margin */}
        <Card className="border border-border bg-card shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("inventory.kpi.profit")}
              </span>
              <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
              {fmt.money(expectedProfit, "UZS")}
            </div>
            <p className="text-xs text-muted-foreground">
              +{marginPercentage.toFixed(1)}% oʻrtacha ustama
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search, Filters & Category Badges ─── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("inventory.search")}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-primary shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={handleToggleLowStock}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors shrink-0 ${
              lowStockOnly
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold"
                : "border-border bg-card hover:bg-muted text-muted-foreground"
            }`}
          >
            <AlertTriangle className="size-3.5 text-amber-500" />
            <span>{t("inventory.filter.low_stock_only")}</span>
            {summary.low_stock_count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {summary.low_stock_count}
              </span>
            )}
          </button>
        </div>

        {/* Category Filter Pills Horizontal Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => handleCategorySelect("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-muted/60 hover:bg-muted text-muted-foreground"
            }`}
          >
            {t("inventory.filter.all")}
          </button>
          {CATEGORIES.map((cat) => {
            const countInfo = summary.categories?.find((c) => c.category === cat.value);
            const isSelected = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => handleCategorySelect(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground"
                }`}
              >
                <span>{getCategoryTitle(cat.value)}</span>
                {countInfo && countInfo.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {countInfo.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Inventory Parts Table ─── */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
            <p className="text-sm">Ehtiyot qismlar yuklanmoqda...</p>
          </div>
        ) : parts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-4">
            <Package className="size-12 stroke-1 mb-3 text-muted-foreground/60" />
            <p className="text-base font-semibold text-foreground">Ehtiyot qismlar topilmadi</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {searchQuery || selectedCategory !== "all" || lowStockOnly
                ? "Filtr boʻyicha hech narsa chiqmadi. Qidiruvni tozalab koʻring."
                : "Ombor boʻsh. 'Yangi tovar qoʻshish' tugmasi orqali dastlabki qismlarni kiriting."}
            </p>
            {!searchQuery && selectedCategory === "all" && !lowStockOnly && (
              <Button
                size="sm"
                className="mt-4"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setCreateModalOpen(true)}
              >
                {t("inventory.action.new_part")}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">{t("inventory.table.part")}</th>
                  <th className="py-3 px-3">{t("inventory.table.category")}</th>
                  <th className="py-3 px-3 text-center">{t("inventory.table.stock")}</th>
                  <th className="py-3 px-3 text-right">{t("inventory.table.cost")}</th>
                  <th className="py-3 px-3 text-right">{t("inventory.table.retail")}</th>
                  <th className="py-3 px-3 text-right">{t("inventory.table.margin")}</th>
                  <th className="py-3 px-4 text-right">{t("inventory.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parts.map((part) => {
                  const isLow = part.is_low_stock || part.quantity_in_stock <= part.min_stock_level;
                  const isOutOfStock = part.quantity_in_stock <= 0;

                  return (
                    <tr key={part.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Name, SKU, OEM, Barcode, Location */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {part.name}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-mono font-medium text-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                              {part.sku}
                            </span>
                            {part.oem_number && (
                              <span title="OEM raqami">OEM: {part.oem_number}</span>
                            )}
                            {part.barcode && (
                              <span className="flex items-center gap-0.5 text-muted-foreground/80">
                                <Barcode className="size-3" />
                                {part.barcode}
                              </span>
                            )}
                            {part.location && (
                              <span className="flex items-center gap-0.5 text-primary/80 font-medium">
                                <MapPin className="size-3" />
                                {part.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-muted font-medium text-muted-foreground">
                          {getCategoryTitle(part.category)}
                        </span>
                      </td>

                      {/* Stock Level & Badge */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-sm text-foreground">
                            {part.quantity_in_stock} {part.unit}
                          </span>
                          {isOutOfStock ? (
                            <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                              {t("inventory.status.out")}
                            </span>
                          ) : isLow ? (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                              <AlertTriangle className="size-2.5" />
                              {t("inventory.status.low")} (min: {part.min_stock_level})
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              {t("inventory.status.in_stock")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cost Price */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-medium text-muted-foreground">
                        {fmt.money(part.cost_price, "UZS")}
                      </td>

                      {/* Retail Price */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-foreground">
                        {fmt.money(part.retail_price, "UZS")}
                      </td>

                      {/* Profit Margin */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +{fmt.money(part.profit_margin, "UZS")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            +{part.profit_margin_percent}%
                          </span>
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => setAdjustPart(part)}
                          >
                            <ArrowUpDown className="size-3 mr-1" />
                            Kirim/Chiqim
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Harakatlar tarixi"
                            onClick={() => setHistoryPart(part)}
                          >
                            <History className="size-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Pagination Footer ─── */}
        {total > limit && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Jami: {total} ta tovar | Koʻrsatilmoqda: {offset + 1} - {Math.min(offset + limit, total)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => fetchParts({ newOffset: Math.max(0, offset - limit) })}
              >
                Oldingisi
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + limit >= total || loading}
                onClick={() => fetchParts({ newOffset: offset + limit })}
              >
                Keyingisi
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {createModalOpen && (
        <NewPartModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={handlePartCreated}
        />
      )}

      {adjustPart && (
        <AdjustStockModal
          part={adjustPart}
          onClose={() => setAdjustPart(null)}
          onUpdated={handlePartUpdated}
        />
      )}

      {historyPart !== undefined && (
        <MovementsModal
          part={historyPart}
          onClose={() => setHistoryPart(undefined)}
        />
      )}
    </div>
  );
}
