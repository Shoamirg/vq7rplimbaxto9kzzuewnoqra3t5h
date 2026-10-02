"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { clientFetch } from "@/lib/api/client";
import type { CustomerList, CustomerListItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

export function CustomerPicker({ onSelect, id = "customer-search" }: {
  onSelect: (customer: CustomerListItem) => void;
  id?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      clientFetch<CustomerList>(`/customers?q=${encodeURIComponent(query.trim())}&limit=8`, { signal: controller.signal })
        .then((data) => { if (active) setItems(data.items); })
        .catch(() => { if (active) { setItems([]); setError(true); } })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, retry]);

  return <div>
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input id={id} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
        aria-label={t("crm.search_customers")} placeholder={t("crm.search_customers")}
        className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
    </div>
    {loading ? <p role="status" className="mt-2 text-xs text-muted-foreground flex gap-2"><Loader2 className="size-3 animate-spin" />{t("crm.search_loading")}</p>
      : error ? <p role="alert" className="mt-2 text-xs text-red-600">{t("intake.load_failed")} <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>{t("intake.retry")}</button></p>
      : items.length ? <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {items.map((customer) => <button type="button" key={customer.id} onClick={() => onSelect(customer)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
          <span className="font-medium">{customer.full_name}</span>{customer.phone ? <span className="text-muted-foreground"> · {customer.phone}</span> : null}
        </button>)}
      </div> : <p className="mt-2 text-xs text-muted-foreground">{t("crm.no_results")}</p>}
  </div>;
}
