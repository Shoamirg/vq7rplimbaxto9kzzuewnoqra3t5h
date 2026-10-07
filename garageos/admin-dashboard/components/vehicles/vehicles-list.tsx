"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Plus, Search, ChevronRight } from "lucide-react";
import { Button } from "@garageos/design-system";
import { NewVehicleModal } from "@/components/intake/intake-modals";
import { usePagedList } from "@/components/intake/use-paged-list";
import { useI18n } from "@/lib/i18n/context";
import type { VehicleList } from "@/lib/api/types";

export function VehiclesList({ initial }: { initial: VehicleList }) {
  const { t, fmt } = useI18n();
  const list = usePagedList("/vehicles", initial);
  const [create, setCreate] = useState(false);
  return <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">{t("crm.vehicles")}</h1><p className="text-sm text-muted-foreground mt-1">{t("crm.count", { count: list.data.total })}</p></div><Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setCreate(true)}>{t("intake.new_vehicle")}</Button></div>
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 max-w-md w-full"><Search className="size-4 shrink-0 text-muted-foreground" /><input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary" value={list.query} onChange={(e) => list.search(e.target.value)} placeholder={t("crm.search_vehicles")} aria-label={t("crm.search_vehicles")} /></div>
    {list.loading ? <p role="status" className="text-sm text-muted-foreground">{t("crm.search_loading")}</p> : list.error ? <p role="alert" className="text-sm text-red-600">{t("intake.load_failed")} <button className="underline" onClick={list.reload}>{t("intake.retry")}</button></p> : list.data.items.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{list.data.items.map((vehicle) => <Link key={vehicle.id} href={`/vehicles/${vehicle.id}`} className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-xs transition-all"><Car className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold truncate">{vehicle.brand} {vehicle.model}</p><p className="text-xs text-muted-foreground">{vehicle.year} · {fmt.number(vehicle.current_km)} km</p><div className="mt-2 flex items-center justify-between"><span className="text-xs font-mono bg-muted px-2 py-1 rounded">{vehicle.license_plate ?? "—"}</span><span className="inline-flex items-center text-xs text-muted-foreground">{t("crm.health")}<ChevronRight className="size-3.5" /></span></div></Link>)}</div> : <p className="text-sm text-muted-foreground">{t("crm.no_vehicles")}</p>}
    <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={!list.offset || list.loading} onClick={list.previous}>{t("crm.previous")}</Button><span className="text-xs text-muted-foreground">{t("crm.page", { page: list.offset / 50 + 1 })}</span><Button size="sm" variant="outline" disabled={!list.data.has_more || list.loading} onClick={list.next}>{t("crm.next")}</Button></div>
    {create ? <NewVehicleModal onClose={() => setCreate(false)} onCreated={list.reload} /> : null}
  </div>;
}
