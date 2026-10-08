"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCheck, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button, cn, useToast } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { NewInvoiceModal } from "@/components/billing/new-invoice-modal";
import { NewAppointmentButton } from "./new-appointment-modal";
import { EditAppointmentModal } from "./edit-appointment-modal";
import { CompleteWorkModal } from "./complete-work-modal";
import { QueueCheckbox, QueueRow, QUEUE_GRID } from "./queue-row";
import { dateParams, eligible, type BulkAction, type DateFilter, type QueueAction } from "./queue-model";
import type { Appointment, AppointmentListResponse, AppointmentStats, InvoiceDoc } from "@/lib/api/types";

const STATUS_TABS: { key: string; labelKey: string; statKey?: keyof AppointmentStats }[] = [
  { key: "all", labelKey: "work.all" }, { key: "pending", labelKey: "status.pending", statKey: "pending_count" },
  { key: "confirmed", labelKey: "status.confirmed", statKey: "confirmed_count" }, { key: "in_progress", labelKey: "status.in_progress" },
  { key: "completed", labelKey: "status.completed", statKey: "completed_count" }, { key: "cancelled", labelKey: "status.cancelled", statKey: "cancelled_count" },
];
const DATE_FILTERS: { key: DateFilter; labelKey: string }[] = [
  { key: "all", labelKey: "work.all_dates" }, { key: "today", labelKey: "work.today" }, { key: "tomorrow", labelKey: "work.tomorrow" },
  { key: "week", labelKey: "queue.next_seven" }, { key: "overdue", labelKey: "work.overdue" },
];
const CONTROL = "min-h-11 min-w-11 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
type ListState = { key: string; phase: "loading" | "error" } | { key: string; phase: "ready"; data: AppointmentListResponse };
type StatsState = { phase: "loading" | "error" } | { phase: "ready"; data: AppointmentStats };

export function AppointmentsList() {
  const { toast } = useToast(), { t, fmt } = useI18n(), router = useRouter();
  const [tab, setTab] = useState("all"), [dateFilter, setDateFilter] = useState<DateFilter>("all"), [page, setPage] = useState(1);
  const [q, setQ] = useState(""), [list, setList] = useState<ListState>(), [statsState, setStatsState] = useState<StatsState>({ phase: "loading" });
  const [editing, setEditing] = useState<Appointment | null>(null), [invoicing, setInvoicing] = useState<Appointment | null>(null), [completing, setCompleting] = useState<Appointment | null>(null);
  const [selection, setSelection] = useState({ key: "", ids: new Set<string>() }), [busy, setBusy] = useState(false);
  const search = q.trim(), key = JSON.stringify([tab, dateFilter, page, search]);
  const keyRef = useRef(key); keyRef.current = key;
  const listEpoch = useRef(0), statsEpoch = useRef(0), mutation = useRef(false);
  const invalidateList = useCallback(() => { listEpoch.current++; }, []);
  const invalidateStats = useCallback(() => { statsEpoch.current++; }, []);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidateList(); invalidateStats(); }; }, [invalidateList, invalidateStats]);
  const root = useRef<HTMLDivElement>(null), returnTo = useRef<string | null>(null);
  const data = list?.key === key && list.phase === "ready" ? list.data : null;
  const ready = data !== null, error = list?.key === key && list.phase === "error";
  const rows = data?.items ?? [], stats = statsState.phase === "ready" ? statsState.data : null;
  const selected = ready && selection.key === key ? selection.ids : new Set<string>();
  const current = useRef({ ready, rows, selected }); current.current = { ready, rows, selected };

  const load = useCallback(async () => {
    if (!mounted.current) return;
    const epoch = ++listEpoch.current;
    current.current.ready = false;
    setList({ key, phase: "loading" }); setSelection({ key, ids: new Set() });
    const params = new URLSearchParams({ page: String(page), page_size: "15", ...dateParams(dateFilter) });
    if (tab !== "all") params.set("status", tab);
    if (search) params.set("q", search);
    try {
      const result = await clientFetch<AppointmentListResponse>(`/appointments?${params}`);
      if (!mounted.current || epoch !== listEpoch.current || keyRef.current !== key) return;
      const lastPage = Math.max(1, result.total_pages);
      if (page > lastPage) { setPage(lastPage); return; }
      setList({ key, phase: "ready", data: result });
    } catch { if (mounted.current && epoch === listEpoch.current && keyRef.current === key) setList({ key, phase: "error" }); }
  }, [key, page, dateFilter, tab, search]);
  const loadRef = useRef(load); loadRef.current = load;
  const loadStats = useCallback(async () => {
    if (!mounted.current) return;
    const epoch = ++statsEpoch.current; setStatsState({ phase: "loading" });
    try {
      const result = await clientFetch<AppointmentStats>("/appointments/stats");
      if (mounted.current && epoch === statsEpoch.current) setStatsState({ phase: "ready", data: result });
    } catch { if (mounted.current && epoch === statsEpoch.current) setStatsState({ phase: "error" }); }
  }, []);
  const refresh = useCallback(() => { void loadRef.current(); void loadStats(); }, [loadStats]);
  useEffect(() => {
    setSelection({ key, ids: new Set() });
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => { clearTimeout(timer); invalidateList(); };
  }, [load, key, search, invalidateList]);
  useEffect(() => { void loadStats(); return invalidateStats; }, [loadStats, invalidateStats]);

  function begin() {
    if (mutation.current || !current.current.ready) return false;
    mutation.current = true; setBusy(true); return true;
  }
  function finish() { mutation.current = false; setBusy(false); refresh(); }
  function closeForms() {
    const id = returnTo.current; returnTo.current = null;
    setEditing(null); setCompleting(null); setInvoicing(null);
    if (id) requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLButtonElement>(`[data-testid="appointment-row-${id}"] [data-queue-actions]`);
      (target || root.current?.querySelector<HTMLInputElement>("#queue-search"))?.focus({ preventScroll: true });
    });
  }
  function edit(appointment: Appointment) {
    const actual = current.current.rows.find(row => row.id === appointment.id);
    if (!mutation.current && current.current.ready && actual && eligible(actual, "cancel")) { returnTo.current = actual.id; setEditing(actual); }
  }
  async function act(id: string, action: QueueAction) {
    const appointment = current.current.rows.find(row => row.id === id);
    if (mutation.current || !current.current.ready || !appointment || !eligible(appointment, action)) return;
    if (action === "complete") { returnTo.current = id; setCompleting(appointment); return; }
    if (action === "start" && !appointment.mechanic_name?.trim()) { toast({ title: t("work.assign_first"), variant: "warning" }); return; }
    if (!begin()) return;
    try {
      await clientFetch(`/appointments/${id}/${action}`, { method: "PATCH", body: JSON.stringify({}) });
      toast({ title: t(`work.${action === "confirm" ? "confirmed" : action === "start" ? "started" : "cancelled"}`), variant: "success" });
    } catch { toast({ title: t("work.failed"), variant: "danger" }); }
    finally { finish(); }
  }
  async function bulkAct(action: BulkAction) {
    const visible = current.current.rows.filter(row => current.current.selected.has(row.id));
    if (!visible.length || !begin()) return;
    const ids = visible.filter(row => eligible(row, action)).map(row => row.id);
    try {
      const results = await Promise.allSettled(ids.map(id => clientFetch(`/appointments/${id}/${action}`, { method: "PATCH", body: JSON.stringify({}) })));
      const done = results.filter(result => result.status === "fulfilled").length, failed = ids.length - done, skipped = visible.length - ids.length;
      toast({ title: t("queue.bulk_result", { done: fmt.number(done), failed: fmt.number(failed), skipped: fmt.number(skipped) }), variant: failed && !done ? "danger" : failed || skipped ? "warning" : "success" });
    } finally { finish(); }
  }
  async function openInvoice(appointment: Appointment) {
    const actual = current.current.rows.find(row => row.id === appointment.id);
    if (!actual || actual.status !== "completed" || !begin()) return;
    try {
      const invoice = await clientFetch<InvoiceDoc>(`/appointments/${actual.id}/invoice`);
      if (current.current.ready && current.current.rows.some(row => row.id === actual.id)) router.push(`/invoice/${invoice.id}`);
    } catch (failure) {
      if (failure instanceof ClientApiError && failure.status === 404) {
        if (current.current.ready && current.current.rows.some(row => row.id === actual.id)) { returnTo.current = actual.id; setInvoicing(actual); }
      } else toast({ title: t("work.invoice_failed"), variant: "danger" });
    } finally { mutation.current = false; setBusy(false); }
  }
  function toggle(id?: string) {
    if (!current.current.ready || mutation.current) return;
    setSelection(previous => {
      const ids = new Set(previous.key === key ? previous.ids : []);
      if (id) { if (!current.current.rows.some(row => row.id === id)) return previous; ids.has(id) ? ids.delete(id) : ids.add(id); }
      else { if (current.current.rows.every(row => ids.has(row.id))) ids.clear(); else for (const row of current.current.rows) ids.add(row.id); }
      return { key, ids };
    });
  }
  const allSelected = rows.length > 0 && rows.every(row => selected.has(row.id));
  const kpis = stats ? [
    { label: "work.today", count: stats.today_count }, { label: "work.waiting", count: stats.pending_count },
    { label: "status.confirmed", count: stats.confirmed_count }, { label: "status.completed", count: stats.completed_count }, { label: "status.cancelled", count: stats.cancelled_count },
  ] : [];

  return <div ref={root} className="min-w-0 p-4 lg:p-6 space-y-4 animate-fade-in" data-testid="appointments-queue">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-foreground">{t("work.title")}</h1><p className="text-sm text-muted-foreground mt-1">{t("work.subtitle")}</p></div>
      <NewAppointmentButton label={t("action.new_appointment")} onCreated={refresh} />
    </div>
    <section aria-label={t("queue.stats_scope")} className="space-y-2">
      <p className="text-sm font-semibold">{t("queue.stats_scope")}</p><p className="text-xs text-muted-foreground">{t("queue.stats_date")}</p>
      {statsState.phase === "loading" && <p role="status" aria-label={t("queue.stats_loading")} className="text-sm text-muted-foreground">{t("queue.stats_loading")}</p>}
      {statsState.phase === "error" && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">{t("queue.stats_failed")}<button className={CONTROL} onClick={() => void loadStats()}>{t("queue.stats_retry")}</button></div>}
      {stats && <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{kpis.map(kpi => <div key={kpi.label} className="rounded-xl border border-border bg-card p-3"><p className="text-xs font-semibold text-muted-foreground">{t(kpi.label)}</p><p className="text-2xl font-bold tabular-nums">{fmt.number(kpi.count)}</p></div>)}</div>}
    </section>
    <div className="flex flex-wrap gap-2" aria-label={t("work.status")} role="group">{STATUS_TABS.map(filter => <button key={filter.key} aria-pressed={tab === filter.key} aria-label={t(filter.labelKey)} onClick={() => { setTab(filter.key); setPage(1); }} className={cn(CONTROL, tab === filter.key && "bg-primary text-primary-foreground hover:bg-primary")}>
      {t(filter.labelKey)}{filter.statKey && stats && <span aria-hidden className="ml-2 tabular-nums">{fmt.number(stats[filter.statKey])}</span>}
    </button>)}</div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 w-full sm:max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-primary"><Search className="size-4 shrink-0 text-muted-foreground" /><input id="queue-search" value={q} maxLength={100} onChange={event => { setQ(event.target.value); setPage(1); }} aria-label={t("work.search")} placeholder={t("work.search")} className="min-h-11 min-w-0 w-full bg-transparent text-sm text-foreground outline-none" /></div>
      <button className={CONTROL} disabled={!ready || busy} onClick={refresh}>{t("queue.refresh")}</button>
    </div>
    <div role="group" aria-label={t("work.when")} className="flex flex-wrap gap-2">{DATE_FILTERS.map(filter => <button key={filter.key} aria-pressed={dateFilter === filter.key} onClick={() => { setDateFilter(filter.key); setPage(1); }} className={cn(CONTROL, dateFilter === filter.key && "border-primary bg-primary/10 text-foreground")}>
      {t(filter.labelKey)}
    </button>)}</div>
    <div className="flex flex-wrap items-center gap-2">
      <QueueCheckbox label={t("queue.select_all")} checked={allSelected} disabled={!ready || !rows.length || busy} onChange={() => toggle()} />
      {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2" data-testid="queue-bulk">
        <span className="text-sm font-semibold">{t("work.bulk_selected", { count: fmt.number(selected.size) })}</span>
        <Button className="min-h-11 min-w-11" variant="outline" leftIcon={<CheckCheck className="size-4" />} disabled={busy} onClick={() => void bulkAct("confirm")}>{t("work.confirm")}</Button>
        <Button className="min-h-11 min-w-11" variant="outline" leftIcon={<X className="size-4" />} disabled={busy} onClick={() => void bulkAct("cancel")}>{t("common.cancel")}</Button>
        <button className={CONTROL} disabled={busy} onClick={() => setSelection({ key, ids: new Set() })}>{t("work.bulk_clear")}</button>
      </div>}
    </div>
    {busy && <p role="status" aria-label={t("queue.working")} className="text-sm text-muted-foreground">{t("queue.working")}</p>}
    <div className="max-w-full rounded-xl border border-border bg-card overflow-x-auto" data-testid="queue-records">
      {!ready && !error && <p role="status" aria-label={t("queue.loading")} className="p-6 text-sm text-muted-foreground">{t("queue.loading")}</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">{t("queue.failed")}<button className={CONTROL} onClick={() => void loadRef.current()}>{t("queue.retry")}</button></div>}
      {ready && rows.length === 0 && <div className="p-12 text-center"><CalendarPlus className="size-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">{t("work.empty")}</p></div>}
      {ready && rows.length > 0 && <>
        <div aria-hidden className={cn("hidden xl:grid gap-3 p-4 bg-muted/40 text-xs font-semibold text-muted-foreground", QUEUE_GRID)}><span />{["customer", "vehicle", "service", "when", "mechanic", "health", "billing", "duration", "status"].map(field => <span key={field} className="min-w-0 break-words [overflow-wrap:anywhere]">{t(`work.${field}`)}</span>)}</div>
        <div role="list" aria-label={t("work.title")} className="divide-y divide-border">{rows.map(appointment => <QueueRow key={appointment.id} appointment={appointment} selected={selected.has(appointment.id)} busy={busy} onToggle={() => toggle(appointment.id)} onAct={(id, action) => void act(id, action)} onEdit={edit} onInvoice={appointment => void openInvoice(appointment)} onNavigate={href => router.push(href)} />)}</div>
      </>}
    </div>
    {data && <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" data-testid="queue-pagination">{t("queue.page", { page: fmt.number(data.page), pages: fmt.number(Math.max(1, data.total_pages)), total: fmt.number(data.total) })}</p>
      <div className="flex gap-2"><button className={cn(CONTROL, "grid place-items-center px-0 size-11")} aria-label={t("queue.previous")} disabled={data.page <= 1 || busy} onClick={() => setPage(data.page - 1)}><ChevronLeft className="size-4" /></button><button className={cn(CONTROL, "grid place-items-center px-0 size-11")} aria-label={t("queue.next")} disabled={data.page >= data.total_pages || busy} onClick={() => setPage(data.page + 1)}><ChevronRight className="size-4" /></button></div>
    </div>}
    {editing && <EditAppointmentModal appointment={editing} onClose={closeForms} onSaved={() => { closeForms(); refresh(); }} />}
    {completing && <CompleteWorkModal appointment={completing} onClose={closeForms} onCompleted={() => { closeForms(); refresh(); }} />}
    {invoicing && <NewInvoiceModal appointment={invoicing} onClose={closeForms} onCreated={doc => { returnTo.current = null; closeForms(); refresh(); router.push(`/invoice/${doc.id}`); }} />}
  </div>;
}
