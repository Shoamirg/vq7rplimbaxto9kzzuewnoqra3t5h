"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RotateCw, Search, Wrench } from "lucide-react";
import { Button, cn, useToast } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { WorkOrder, WorkOrderListResponse, WorkOrderStatus } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { WorkOrderCard } from "./work-order-card";
import { WorkOrderDetail } from "./work-order-detail";
import { WorkOrderIntakeDialog } from "./work-order-intake-dialog";

const PAGE_SIZE = 12;
const FILTERS: (WorkOrderStatus | "all")[] = ["all", "received", "in_progress", "ready", "completed", "cancelled"];

export function WorkOrdersWorkspace({ role, initialOrderId }: { role: string; initialOrderId: string | null }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const isOffice = ["admin", "manager", "receptionist"].includes(role);
  const [status, setStatus] = useState<WorkOrderStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WorkOrderListResponse | null>(null);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const intakeButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (status !== "all") params.set("status", status);
    try {
      setResult(await clientFetch<WorkOrderListResponse>(`/work-orders?${params}`));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!initialOrderId) return;
    clientFetch<WorkOrder>(`/work-orders/${initialOrderId}`)
      .then(setSelected)
      .catch(() => toast({ title: t("wo.load_error"), variant: "danger" }));
  }, [initialOrderId, t, toast]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const items = result?.items ?? [];
    if (!needle) return items;
    return items.filter((order) =>
      `${order.customer_name} ${order.vehicle_summary} ${order.service_type}`.toLocaleLowerCase().includes(needle),
    );
  }, [query, result]);

  function handleCreated(order: WorkOrder) {
    setIntakeOpen(false);
    setPage(1);
    setStatus("all");
    setSelected(order);
    window.requestAnimationFrame(() => intakeButtonRef.current?.focus());
    toast({ title: t("wo.created"), variant: "success" });
  }

  function closeIntake() {
    setIntakeOpen(false);
    window.requestAnimationFrame(() => intakeButtonRef.current?.focus());
  }

  function handleUpdated(order: WorkOrder) {
    setSelected(order);
    void load();
    toast({ title: t("wo.updated"), variant: "success" });
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">GarageOS</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{t("wo.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("wo.subtitle")}</p>
        </div>
        {isOffice ? (
          <Button ref={intakeButtonRef} onClick={() => setIntakeOpen(true)} leftIcon={<Plus className="size-4" />}>
            {t("wo.new")}
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label={t("wo.title")}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={status === filter}
              onClick={() => { setStatus(filter); setPage(1); }}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                status === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(filter === "all" ? "wo.status.all" : `wo.status.${filter}`)}
            </button>
          ))}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 lg:w-72">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">{t("wo.search")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("wo.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
      </div>

      {failed ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-card p-8 text-center">
          <p className="text-sm text-foreground">{t("wo.load_error")}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => void load()} leftIcon={<RotateCw className="size-4" />}>
            {t("wo.retry")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
          <section aria-label={t("wo.title")} aria-busy={loading} className={cn("min-w-0 space-y-3", selected && "hidden xl:block")}>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-card" />)}
              </div>
            ) : visibleOrders.length ? (
              visibleOrders.map((order) => (
                <WorkOrderCard key={order.id} order={order} active={selected?.id === order.id} onClick={() => setSelected(order)} />
              ))
            ) : (
              <div role="status" className="rounded-lg border border-border bg-card px-5 py-12 text-center">
                <Wrench className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-3 font-semibold text-foreground">{query || status !== "all" ? t("wo.no_matches") : t("wo.empty_title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{query || status !== "all" ? t("wo.no_matches_desc") : t("wo.empty_desc")}</p>
                {isOffice && !query && status === "all" ? <Button className="mt-4" size="sm" onClick={() => setIntakeOpen(true)} leftIcon={<Plus className="size-4" />}>{t("wo.new")}</Button> : null}
              </div>
            )}
            {result && result.total_pages > 1 ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">{t("wo.page", { page: result.page, pages: result.total_pages, total: result.total })}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" aria-label={t("wo.previous")} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button>
                  <Button variant="outline" size="icon" aria-label={t("wo.next")} disabled={page >= result.total_pages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button>
                </div>
              </div>
            ) : null}
          </section>

          {selected ? (
            <WorkOrderDetail order={selected} role={role} onUpdated={handleUpdated} onClose={() => setSelected(null)} />
          ) : (
            <div className="hidden rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground xl:grid xl:place-items-center">
              {t("wo.order_details")}
            </div>
          )}
        </div>
      )}

      {intakeOpen && isOffice ? <WorkOrderIntakeDialog onClose={closeIntake} onCreated={handleCreated} /> : null}
    </div>
  );
}
