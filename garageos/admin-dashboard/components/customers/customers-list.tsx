"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Car, ArrowRight, Plus } from "lucide-react";
import { Button } from "@garageos/design-system";
import { EmptyState } from "@/components/states/empty-state";
import { NewCustomerModal } from "@/components/intake/intake-modals";
import { usePagedList } from "@/components/intake/use-paged-list";
import { useI18n } from "@/lib/i18n/context";
import type { CustomerList } from "@/lib/api/types";

const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function CustomersList({ initial }: { initial: CustomerList }) {
  const { t, fmt } = useI18n();
  const list = usePagedList("/customers", initial);
  const [create, setCreate] = useState(false);
  return <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{t("crm.customers")}</h1><p className="text-sm text-muted-foreground mt-1">{t("crm.count", { count: list.data.total })}</p></div>
      <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setCreate(true)}>{t("intake.new_customer")}</Button>
    </div>
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 max-w-md w-full"><Search className="size-4 text-muted-foreground shrink-0" /><input value={list.query} onChange={(e) => list.search(e.target.value)} aria-label={t("crm.search_customers")} placeholder={t("crm.search_customers")} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>
    {list.loading ? <p role="status" className="text-sm text-muted-foreground">{t("crm.search_loading")}</p>
      : list.error ? <p role="alert" className="text-sm text-red-600">{t("intake.load_failed")} <button className="underline" onClick={list.reload}>{t("intake.retry")}</button></p>
      : list.data.items.length === 0 ? <EmptyState icon={Car} title={t("crm.no_customers")} description={t("crm.no_results")} />
      : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{list.data.items.map((customer) => {
        const money = customer.lifetime_value_by_currency ?? { USD: customer.lifetime_value };
        return <Link key={customer.id} href={`/customers/${customer.id}`} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group">
          <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary font-bold shrink-0">{monogram(customer.full_name)}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{customer.full_name}</p><p className="text-xs text-muted-foreground truncate">{customer.phone ?? customer.email ?? t("crm.no_contact")}</p></div><ArrowRight className="size-4 text-muted-foreground group-hover:text-primary shrink-0" /></div>
          <div className="mt-3 flex flex-wrap gap-2 items-center justify-between text-xs"><span className="text-muted-foreground flex items-center gap-1"><Car className="size-3" />{t("crm.vehicle_count", { count: customer.vehicle_count })}</span><span className="font-semibold">{Object.entries(money).map(([currency, value]) => fmt.money(value, currency)).join(" · ") || "—"}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{t("crm.last_visit")} {customer.last_visit ? fmt.date(customer.last_visit) : "—"}</p>
        </Link>;
      })}</div>}
    <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={!list.offset || list.loading} onClick={list.previous}>{t("crm.previous")}</Button><span className="text-xs text-muted-foreground">{t("crm.page", { page: list.offset / 50 + 1 })}</span><Button size="sm" variant="outline" disabled={!list.data.has_more || list.loading} onClick={list.next}>{t("crm.next")}</Button></div>
    {create ? <NewCustomerModal onClose={() => setCreate(false)} onCreated={list.reload} /> : null}
  </div>;
}
