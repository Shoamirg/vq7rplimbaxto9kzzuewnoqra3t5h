"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { cn, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BillingCounts, BillingResponse, InvoiceDoc } from "@/lib/api/types";
import { useStaffMessageSession, verifyStaffMessageActor } from "@/lib/use-staff-message-session";
import { messageSessionEpoch } from "@/lib/message-reset";
import { accessFailure } from "../operations/use-operation-read";
import { useBillingRead } from "./use-billing-read";
import { DocumentView } from "./document-view";
import { NewInvoiceModal } from "./new-invoice-modal";
import { STATUS_META, VIEWS } from "./shared";

const CONTROL = "min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeDocumentId = (id: string | null) => id && UUID.test(id) ? id.toLowerCase() : id;

// List filters and explicit document identity are independent owning reads.
export function BillingWorkspace({ canVoid = false }: { canVoid?: boolean }) {
  const [view, setView] = useState("invoices");
  const [q, setQ] = useState(""), [page, setPage] = useState(1);
  const [automatic, setAutomatic] = useState<{ key: string | null; id: string | null }>({ key: null, id: null });
  const [newKind, setNewKind] = useState<"estimate" | "invoice" | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<InvoiceDoc | null>(null);
  const [editDoc, setEditDoc] = useState<InvoiceDoc | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [mobileDocument, setMobileDocument] = useState(false);
  const session = useStaffMessageSession(), params = useSearchParams();
  const [denied, setDenied] = useState(false), [verification, setVerification] = useState(0);
  const deniedRef = useRef(false), mounted = useRef(true);
  const pending = useRef<symbol | null>(null);
  const { toast } = useToast();
  const { t, fmt } = useI18n();
  const money = fmt.money;
  const actor = denied ? null : session.actor;
  const currentActor = useRef(actor); currentActor.current = actor;
  const authorized = () => !deniedRef.current && session.isAuthorized();
  const onDenied = (_error: unknown) => {
    session.suspend(); deniedRef.current = true; setDenied(true);
    setNewKind(null); setEditDoc(null); setDeleteDoc(null);
  };
  const principal = actor ? `${actor.center}:${actor.id}:${verification}` : null;
  const query = new URLSearchParams({ view, q, page: String(page), page_size: "80" });
  const listKey = principal ? `${principal}:${query}` : null;
  const list = useBillingRead<BillingResponse>(listKey, `/invoices?${query}`, actor, onDenied);
  const linkedId = params.get("invoice");
  const activeId = normalizeDocumentId(linkedId !== null ? linkedId : automatic.key === listKey ? automatic.id : null);
  const validId = !!activeId && UUID.test(activeId);
  const documentKey = principal && validId ? `${principal}:${activeId}` : null;
  const detail = useBillingRead<InvoiceDoc>(documentKey, validId ? `/invoices/${activeId}` : null, actor, onDenied);
  const doc = detail.data?.id === activeId && !(detail.error instanceof ClientApiError && detail.error.status === 404) ? detail.data : null;
  const documentError = !!detail.error || linkedId !== null && !validId;
  const items = list.data?.items ?? [], counts = list.data?.counts, kpis = list.data?.kpis;
  const loadError = !!list.error, loading = list.loading;
  const currentSelection = useRef(activeId); currentSelection.current = activeId;
  const currentDocument = useRef(detail); currentDocument.current = detail;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (list.data && !list.loading && !list.error && linkedId === null && automatic.key !== listKey)
      setAutomatic({ key: listKey, id: list.data.items[0]?.id ?? null });
  }, [list.data, list.loading, list.error, linkedId, automatic.key, listKey]);
  useEffect(() => {
    const data = list.data;
    if (data && !list.loading && !list.error && data.page > Math.max(1, data.total_pages))
      setPage(Math.max(1, data.total_pages));
  }, [list.data, list.loading, list.error]);
  useEffect(() => { if (linkedId !== null) setMobileDocument(true); }, [linkedId]);
  const selectDocument = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("invoice", id); else url.searchParams.delete("invoice");
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    setAutomatic({ key: null, id: null }); setMobileDocument(!!id);
  }, []);
  const verify = async () => {
    deniedRef.current = false; setDenied(false); setVerification(old => old + 1);
    pending.current = null; setActionPending(false);
    setNewKind(null); setEditDoc(null); setDeleteDoc(null);
    await session.verify();
  };
  const refresh = async () => {
    const capturedActor = actor;
    const current = () => mounted.current && currentActor.current === capturedActor && authorized();
    if (!capturedActor || !current()) return;
    try {
      await verifyStaffMessageActor(current, capturedActor);
      if (!current()) return;
      await Promise.all([list.refresh(), validId ? detail.refresh() : Promise.resolve(null)]);
    } catch (error) { if (current() && accessFailure(error)) onDenied(error); }
  };
  const act = async (fn: () => Promise<InvoiceDoc>, allowNewDocument = false) => {
    if (pending.current) throw new Error("Billing action already pending");
    const capturedActor = actor, capturedId = activeId, epoch = messageSessionEpoch();
    const flight = Symbol("billing-action"); pending.current = flight; setActionPending(true);
    const current = () => mounted.current && currentActor.current === capturedActor && authorized()
      && epoch === messageSessionEpoch();
    const selected = () => currentSelection.current === capturedId
      && (normalizeDocumentId(new URLSearchParams(window.location.search).get("invoice")) ?? capturedId) === capturedId;
    try {
      if (!capturedActor || !capturedId || !current()) throw new ClientApiError("Billing access unavailable", 401);
      const fresh = await verifyStaffMessageActor(current, capturedActor);
      if (!fresh.canWrite) throw new ClientApiError("Billing write access unavailable", 403);
      if (!current() || !selected() || currentDocument.current.loading || currentDocument.current.error) return false;
      const updated = await fn();
      if (!current()) return false;
      if (!UUID.test(updated?.id ?? "") || !allowNewDocument && updated.id !== capturedId)
        throw new Error("Billing acknowledgement identity unavailable");
      await verifyStaffMessageActor(current, capturedActor);
      if (!current()) return false;
      if (selected()) {
        if (updated.id !== capturedId) selectDocument(updated.id);
        else await detail.refresh();
      }
      if (current()) await list.refresh();
      return current();
    } catch (error) {
      if (current() && accessFailure(error)) onDenied(error);
      throw error;
    } finally {
      if (pending.current === flight) { pending.current = null; if (mounted.current) setActionPending(false); }
    }
  };

  const perform = (fn: () => Promise<InvoiceDoc>, allowNewDocument = false) => {
    void act(fn, allowNewDocument).catch(() => toast({ title: t("billing.action_failed"), description: t("billing.try_again"), variant: "danger" }));
  };

  const title = t(`billing.${view}`);

  if (!actor) return (
    <div className="h-full min-w-0 flex flex-col">
      <h1 className="border-b border-border p-4 font-bold">{t("billing.title")}</h1>
      <div className="flex-1 grid place-items-center p-4">
        {denied || session.error ? <div role="alert" className="space-y-3 text-center">
          <p>{t("billing.access_unavailable")}</p><button className={CONTROL} onClick={() => void verify()}>{t("message.verify")}</button>
        </div> : <p role="status">{t("billing.loading")}</p>}
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col overflow-y-auto xl:overflow-hidden">
      {/* KPI header */}
      <div className="flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-b border-border bg-card shrink-0">
        <FileText className="size-5 text-primary" />
        <h1 className="font-bold text-foreground">{t("billing.title")}</h1>
        {kpis && (
          <div tabIndex={0} className="order-last w-full flex items-center gap-5 overflow-x-auto sm:order-0 sm:w-auto sm:ml-4 focus-visible:outline-2 focus-visible:outline-primary">
            <Kpi k={t("billing.outstanding")} v={money(kpis.outstanding, kpis.currency)} tone="text-red-700 dark:text-red-400" />
            <Kpi k={t("billing.overdue")} v={money(kpis.overdue, kpis.currency)} tone="text-amber-700 dark:text-amber-400" />
            <Kpi k={t("billing.paid_month")} v={money(kpis.paid_this_month, kpis.currency)} tone="text-emerald-700 dark:text-emerald-400" />
          </div>
        )}
        <div className="ml-auto min-w-0 max-w-full flex flex-wrap gap-2">
          <button onClick={() => void refresh()} className={CONTROL}>{t("billing.refresh")}</button>
          <button disabled={actionPending || !session.canWrite} onClick={() => setNewKind("estimate")} className={CONTROL}>＋ {t("public.estimate")}</button>
          <button disabled={actionPending || !session.canWrite} onClick={() => setNewKind("invoice")} className={cn(CONTROL, "bg-primary text-primary-foreground")}>＋ {t("public.invoice")}</button>
        </div>
      </div>

      {newKind && (
        <NewInvoiceModal
          kind={newKind}
          onClose={() => setNewKind(null)}
          onCreated={(created) => { if (currentActor.current === actor && authorized()) { selectDocument(created.id); void list.refresh(); } }}
        />
      )}

      {editDoc && (
        <NewInvoiceModal
          edit={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={() => { if (currentActor.current === actor && authorized()) { void detail.refresh(); void list.refresh(); setEditDoc(null); } }}
        />
      )}

      {deleteDoc && (
        <ConfirmDialog
          title={t("billing.delete_title", { kind: t(deleteDoc.kind === "estimate" ? "public.estimate" : "public.invoice") })}
          message={t("billing.delete_message", { code: deleteDoc.code })}
          confirmLabel={t("billing.delete")}
          onClose={() => setDeleteDoc(null)}
          onConfirm={async () => {
            if (pending.current) return;
            const capturedActor = actor, target = deleteDoc, epoch = messageSessionEpoch();
            const flight = Symbol("billing-delete"); pending.current = flight; setActionPending(true);
            const current = () => mounted.current && currentActor.current === capturedActor && authorized() && epoch === messageSessionEpoch();
            try {
              const fresh = await verifyStaffMessageActor(current, capturedActor);
              if (!fresh.canWrite) throw new ClientApiError("Billing write access unavailable", 403);
              if (!current() || currentSelection.current !== target.id
                || (normalizeDocumentId(new URLSearchParams(window.location.search).get("invoice")) ?? target.id) !== target.id
                || currentDocument.current.loading || currentDocument.current.error)
                throw new Error("Billing selection changed");
              await clientFetch(`/invoices/${target.id}`, { method: "DELETE" });
              if (!current()) return;
              await verifyStaffMessageActor(current, capturedActor);
              if (!current()) return;
              toast({ title: t("billing.deleted"), description: target.code, variant: "success" });
              setDeleteDoc(null);
              if (currentSelection.current === target.id) selectDocument(null);
              await list.refresh();
            } catch (err) {
              if (!current()) return;
              if (accessFailure(err)) onDenied(err);
              setDeleteDoc(null);
              const paid = err instanceof ClientApiError && err.status === 409;
              toast({
                title: paid ? t("billing.delete_protected") : t("billing.delete_failed"),
                description: paid ? t("billing.delete_protected_hint") : t("billing.try_again"),
                variant: "danger",
              });
            } finally {
              if (pending.current === flight) { pending.current = null; if (mounted.current) setActionPending(false); }
            }
          }}
        />
      )}

      {loadError && (
        <div role="alert" className="shrink-0 flex items-center justify-between gap-3 p-3 text-sm bg-red-50 text-red-700">
          <span>{t("billing.load_failed")}</span><button onClick={() => void list.refresh()} className={CONTROL}>{t("billing.retry")}</button>
        </div>
      )}
      <div className="flex-none xl:flex-1 min-h-0 min-w-0 flex flex-col xl:flex-row overflow-hidden">
        {/* rail */}
        <nav aria-label={t("billing.documents")} className="flex xl:block xl:w-44 shrink-0 bg-slate-900 text-slate-300 overflow-x-auto xl:overflow-y-auto py-2">
          <p className="hidden xl:block px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("billing.documents")}</p>
          {VIEWS.map((v) => {
            const n = v.count && counts ? counts[v.count as keyof BillingCounts] : undefined;
            const active = view === v.key;
            const alert = v.key === "overdue";
            return (
              <button key={v.key} aria-pressed={active} onClick={() => { setView(v.key); setPage(1); selectDocument(null); }}
                className={cn("min-h-11 min-w-11 flex shrink-0 items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  active ? "bg-primary-600/20 text-white" : "hover:bg-slate-800")}>
                <span className="w-4 text-center">{v.icon}</span>
                <span className="flex-1 text-left truncate">{t(`billing.${v.key}`)}</span>
                {n ? <span className={cn("text-[11px] font-bold rounded-full px-1.5", active ? "bg-primary-600 text-white" : alert && n > 0 ? "bg-red-600 text-white" : "bg-slate-950 text-slate-400")}>{n}</span> : null}
              </button>
            );
          })}
        </nav>

        {/* queue */}
        <section aria-label={t("billing.document_queue")} className={cn("min-h-128 xl:min-h-0 min-w-0 w-full xl:w-80 xl:shrink-0 bg-card border-r border-border flex-col", mobileDocument ? "hidden xl:flex" : "flex flex-1 xl:flex-none")}>
          <div className="shrink-0 space-y-2 px-3 py-3 border-b border-border">
            <h2 className="text-sm font-bold">{title}</h2>
            <label htmlFor="billing-search" className="block text-xs font-semibold">{t("billing.search_documents")}</label>
            <input id="billing-search" value={q} maxLength={100} onChange={event => { setQ(event.target.value); setPage(1); }} className={cn(CONTROL, "w-full font-normal")} />
            {list.data && <p className="text-xs text-muted-foreground">{t("billing.matched_total", { count: list.data.total })}</p>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!loading && !loadError && items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("billing.empty")}</p>}
            {loading && <p role="status" className="px-4 py-5 text-center text-sm text-muted-foreground">{t("billing.loading")}</p>}
            {items.map((d) => {
              const st = STATUS_META[d.status];
              const active = activeId === d.id;
              return (
                <button key={d.id} onClick={() => selectDocument(d.id)}
                  className={cn("min-h-11 min-w-0 w-full text-left px-4 py-3 break-words border-b border-border/70 border-l-[3px] transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                    active ? "bg-primary/5 border-l-primary" : "border-l-transparent hover:bg-muted/40")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-px rounded", d.kind === "estimate" ? "text-primary-600 bg-primary-50" : "text-primary-600 bg-primary-50")}>{t(`public.${d.kind}`)}</span>
                    <span className="font-mono text-[11.5px] font-bold text-slate-600 dark:text-slate-300">{d.code}</span>
                    <span className="ml-auto font-mono text-[14px] font-extrabold">{money(d.total, d.currency)}</span>
                  </div>
                  <p className="text-[13.5px] font-bold mt-1.5">{d.customer_name ?? "—"}</p>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-300 truncate">{d.vehicle_label ?? ""}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded", d.status === "draft" ? "text-slate-700 bg-slate-100" : st.cls)}>{t(`public.status_${d.status}`)}</span>
                    {d.kind === "invoice" && d.balance > 0 && <span className="text-[11px] text-muted-foreground">{t("public.balance")} {money(d.balance, d.currency)}{d.due_date ? ` · ${t("public.due")} ${fmt.date(d.due_date, { month: "short", day: "numeric" })}` : ""}</span>}
                    {d.kind === "invoice" && d.balance <= 0 && <span className="text-[11px] text-muted-foreground">{d.paid_at ? t("public.status_paid") : ""}</span>}
                    {d.kind === "estimate" && <span className="text-[11px] text-slate-600 dark:text-slate-300">{fmt.date(d.created_at)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-border p-3">
            <p className="w-full text-xs text-muted-foreground" aria-live="polite">{list.data ? t("billing.page_of", { page: list.data.page, pages: Math.max(1, list.data.total_pages) }) : t("billing.loading")}</p>
            <button className={CONTROL} disabled={loading || loadError || page <= 1} onClick={() => setPage(old => Math.max(1, old - 1))}>{t("billing.previous_page")}</button>
            <button className={CONTROL} disabled={loading || loadError || !list.data || page >= list.data.total_pages} onClick={() => setPage(old => old + 1)}>{t("billing.next_page")}</button>
          </div>
        </section>

        {/* document */}
        <div className={cn("flex-1 min-h-128 xl:min-h-0 min-w-0 flex-col", mobileDocument ? "flex" : "hidden xl:flex")}>
          <button onClick={() => setMobileDocument(false)} className="min-h-11 min-w-11 xl:hidden shrink-0 p-3 text-left text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">← {t("billing.back_to_list")}</button>
          {documentError && <div role="alert" className="shrink-0 p-3 text-sm">
            <p>{t("billing.document_failed")}</p>
            {validId && <button onClick={() => void detail.refresh()} className={cn(CONTROL, "mt-2")}>{t("billing.retry")}</button>}
          </div>}
        {doc ? (
          <DocumentView
            key={doc.id}
            doc={doc}
            actionPending={actionPending || !session.canWrite || detail.loading || !!detail.error}
            onStatus={(s) => perform(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) }))}
            onSend={() => {
              void act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/send`, { method: "POST", body: JSON.stringify({}) }))
                .then(success => { if (success) toast({ title: t("billing.shared"), variant: "success" }); })
                .catch(() => toast({ title: t("billing.action_failed"), description: t("billing.try_again"), variant: "danger" }));
            }}
            onConvert={() => perform(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/convert`, { method: "POST", body: JSON.stringify({}) }), true)}
            onRecordPayment={async (amount, method, idempotencyKey) => {
              const acknowledged = await act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/payments`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ amount, method }) }));
              if (!acknowledged) throw new Error("Billing payment not acknowledged");
            }}
            onDelete={() => setDeleteDoc(doc)}
            canVoid={canVoid}
            onEdit={() => setEditDoc(doc)}
          />
        ) : (
          <div className="flex-1 grid place-items-center p-4 text-muted-foreground text-sm">
            {!documentError && t(activeId ? "billing.loading" : "billing.select")}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, tone }: { k: string; v: string; tone: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={cn("text-[15px] font-extrabold tabular-nums", tone)}>{v}</span>
    </div>
  );
}
