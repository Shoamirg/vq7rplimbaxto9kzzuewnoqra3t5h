import { getInventorySummary, getPartsList } from "@/lib/api/server";
import { InventoryView } from "@/components/inventory/inventory-view";
import type { InventorySummary, PartsListResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  let summary: InventorySummary = {
    total_parts: 0,
    total_stock_count: 0,
    total_cost_value: 0,
    total_retail_value: 0,
    low_stock_count: 0,
    categories: [],
  };

  let parts: PartsListResponse = {
    items: [],
    total: 0,
    offset: 0,
    limit: 50,
  };

  try {
    const [sumRes, partsRes] = await Promise.all([
      getInventorySummary(),
      getPartsList({ limit: 50, offset: 0 }),
    ]);
    if (sumRes) summary = sumRes;
    if (partsRes) parts = partsRes;
  } catch (err) {
    console.warn("Could not pre-fetch inventory data during SSR:", err);
  }

  return <InventoryView initialSummary={summary} initialParts={parts} />;
}
