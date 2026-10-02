"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { cn, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BillingCounts, BillingKpis, BillingResponse, InvoiceDoc, InvoiceListItem } from "@/lib/api/types";
import { DocumentView } from "./document-view";
import { NewInvoiceModal } from "./new-invoice-modal";
import { STATUS_META, VIEWS } from "./shared";

// The Commercial workspace — rail (views) ↔ queue ↔ document, swapped by state.
export function BillingWorkspace() {
  const [view, setView] = useState("invoices");
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [counts, setCounts] = useState<BillingCounts | null>(null);
  const [kpis, setKpis] = useState<BillingKpis | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doc, setDoc] = useState<InvoiceDoc | null>(null);
  const [newKind, setNewKind] = useState<"estimate" | "invoice" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [documentError, setDocumentError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [mobileDocument, setMobileDocument] = useState(false);
  const listRequest = useRef(0);
  const documentRequest = useRef(0);
  const pending = useRef(false);
  const { toast } = useToast();
  const { t, fmt } = useI18n();
  const money = fmt.money;

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true); setLoadError(false);
    try {
      const data = await clientFetch<BillingResponse>(`/invoices?view=${view}`);
      if (request !== listRequest.current) return;
      setItems(data.items); setCounts(data.counts); setKpis(data.kpis);
      setActiveId((cur) => cur ?? data.items[0]?.id ?? null);
    } catch {
      if (request === listRequest.current) setLoadError(true);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [view]);

  const loadDoc = useCallback(async (id: string) => {
    const request = ++documentRequest.current;
    setDoc(null); setDocumentError(false);
    try {
      const updated = await clientFetch<InvoiceDoc>(`/invoices/${id}`);
      if (request === documentRequest.current) setDoc(updated);
    } catch {
      if (request === documentRequest.current) setDocumentError(true);
    }
  }, []);

  const invalidateList = useCallback(() => { listRequest.current++; }, []);
  const invalidateDocument = useCallback(() => { documentRequest.current++; }, []);
  useEffect(() => { load(); return invalidateList; }, [load, invalidateList]);
  useEffect(() => {
    if (activeId) loadDoc(activeId);
    return invalidateDocument;
  }, [activeId, loadDoc, invalidateDocument]);

  const act = useCallback(async (fn: () => Promise<InvoiceDoc>) => {
    if (pending.current) throw new Error("Billing action already pending");
    pending.current = true; setActionPending(true);
    try {
      const updated = await fn();
      setDoc(updated);
      if (updated?.id && updated.id !== activeId) setActiveId(updated.id);
      await load();
    } finally {
      pending.current = false; setActionPending(false);
    }
  }, [activeId, load]);

  const perform = (fn: () => Promise<InvoiceDoc>) => {
    void act(fn).catch(() => toast({ title: t("billing.action_failed"), description: t("billing.try_again"), variant: "danger" }));
  };

  const title = t(`billing.${view}`);

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col">
      {/* KPI header */}
      <div className="flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-b border-border bg-card shrink-0">
        <FileText className="size-5 text-primary" />
        <span className="font-bold text-foreground">{t("billing.title")}</span>
        {kpis && (
          <div className="order-last w-full flex items-center gap-5 overflow-x-auto sm:order-none sm:w-auto sm:ml-4">
            <Kpi k={t("billing.outstanding")} v={money(kpis.outstanding, kpis.currency)} tone="text-red-600" />
            <Kpi k={t("billing.overdue")} v={money(kpis.overdue, kpis.currency)} tone="text-amber-600" />
            <Kpi k={t("billing.paid_month")} v={money(kpis.paid_this_month, kpis.currency)} tone="text-emerald-600" />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button disabled={actionPending} onClick={() => setNewKind("estimate")} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-border text-slate-600 hover:bg-muted disabled:opacity-50">＋ {t("public.estimate")}</button>
          <button disabled={actionPending} onClick={() => setNewKind("invoice")} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">＋ {t("public.invoice")}</button>
        </div>
      </div>

      {newKind && (
        <NewInvoiceModal
          kind={newKind}
          onClose={() => setNewKind(null)}
          onCreated={(created) => { setActiveId(created.id); setMobileDocument(true); load(); }}
        />
      )}

      {editOpen && doc && (
        <NewInvoiceModal
          edit={doc}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { setDoc(updated); load(); setEditOpen(false); }}
        />
      )}

      {confirmDelete && doc && (
        <ConfirmDialog
          title={t("billing.delete_title", { kind: t(doc.kind === "estimate" ? "public.estimate" : "public.invoice") })}
          message={t("billing.delete_message", { code: doc.code })}
          confirmLabel={t("billing.delete")}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await clientFetch(`/invoices/${doc.id}`, { method: "DELETE" });
              toast({ title: t("billing.deleted"), description: doc.code, variant: "success" });
              setConfirmDelete(false);
              setActiveId(null); setDoc(null);
              load();
            } catch (err) {
              setConfirmDelete(false);
              const paid = err instanceof ClientApiError && err.status === 409;
              toast({
                title: paid ? t("billing.delete_protected") : t("billing.delete_failed"),
                description: paid ? t("billing.delete_protected_hint") : t("billing.try_again"),
                variant: "danger",
              });
            }
          }}
        />
      )}

      {loadError && (
        <div role="alert" className="shrink-0 flex items-center justify-between gap-3 p-3 text-sm bg-red-50 text-red-700">
          <span>{t("billing.load_failed")}</span><button onClick={load} className="font-bold underline">{t("billing.retry")}</button>
        </div>
      )}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col xl:flex-row overflow-hidden">
        {/* rail */}
        <nav aria-label={t("billing.documents")} className="flex xl:block xl:w-44 shrink-0 bg-slate-900 text-slate-300 overflow-x-auto xl:overflow-y-auto py-2">
          <p className="hidden xl:block px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("billing.documents")}</p>
          {VIEWS.map((v) => {
            const n = v.count && counts ? counts[v.count as keyof BillingCounts] : undefined;
            const active = view === v.key;
            const alert = v.key === "overdue";
            return (
              <button key={v.key} disabled={actionPending} aria-pressed={active} onClick={() => { setView(v.key); setActiveId(null); setDoc(null); setMobileDocument(false); }}
                className={cn("flex shrink-0 items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors disabled:opacity-50",
                  active ? "bg-blue-600/20 text-white" : "hover:bg-slate-800")}>
                <span className="w-4 text-center">{v.icon}</span>
                <span className="flex-1 text-left truncate">{t(`billing.${v.key}`)}</span>
                {n ? <span className={cn("text-[11px] font-bold rounded-full px-1.5", active ? "bg-blue-600 text-white" : alert && n > 0 ? "bg-red-600 text-white" : "bg-slate-950 text-slate-400")}>{n}</span> : null}
              </button>
            );
          })}
        </nav>

        {/* queue */}
        <div className={cn("min-h-0 w-full xl:w-80 xl:shrink-0 bg-card border-r border-border flex-col", mobileDocument ? "hidden xl:flex" : "flex flex-1 xl:flex-none")}>
          <div className="h-11 flex items-center px-4 border-b border-border"><span className="text-sm font-bold flex-1">{title}</span><span className="text-xs text-muted-foreground">{items.length}</span></div>
          <div className="flex-1 overflow-y-auto">
            {!loading && !loadError && items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("billing.empty")}</p>}
            {loading && <p role="status" className="px-4 py-5 text-center text-sm text-muted-foreground">{t("billing.loading")}</p>}
            {items.map((d) => {
              const st = STATUS_META[d.status];
              const active = activeId === d.id;
              return (
                <button key={d.id} disabled={actionPending} onClick={() => { setActiveId(d.id); setMobileDocument(true); }}
                  className={cn("w-full text-left px-4 py-3 border-b border-border/70 border-l-[3px] transition-colors",
                    active ? "bg-primary/5 border-l-primary" : "border-l-transparent hover:bg-muted/40")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-px rounded", d.kind === "estimate" ? "text-purple-600 bg-purple-50" : "text-blue-600 bg-blue-50")}>{t(`public.${d.kind}`)}</span>
                    <span className="font-mono text-[11.5px] font-bold text-slate-600">{d.code}</span>
                    <span className="ml-auto font-mono text-[14px] font-extrabold">{money(d.total, d.currency)}</span>
                  </div>
                  <p className="text-[13.5px] font-bold mt-1.5">{d.customer_name ?? "—"}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">{d.vehicle_label ?? ""}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded", st.cls)}>{t(`public.status_${d.status}`)}</span>
                    {d.kind === "invoice" && d.balance > 0 && <span className="text-[11px] text-muted-foreground">{t("public.balance")} {money(d.balance, d.currency)}{d.due_date ? ` · ${t("public.due")} ${fmt.date(d.due_date, { month: "short", day: "numeric" })}` : ""}</span>}
                    {d.kind === "invoice" && d.balance <= 0 && <span className="text-[11px] text-muted-foreground">{d.paid_at ? t("public.status_paid") : ""}</span>}
                    {d.kind === "estimate" && <span className="text-[11px] text-muted-foreground">{fmt.date(d.created_at)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* document */}
        <div className={cn("flex-1 min-h-0 min-w-0 flex-col", mobileDocument ? "flex" : "hidden xl:flex")}>
          <button onClick={() => setMobileDocument(false)} disabled={actionPending} className="xl:hidden shrink-0 p-3 text-left text-sm font-semibold text-primary">← {t("billing.back_to_list")}</button>
        {doc ? (
          <DocumentView
            key={doc.id}
            doc={doc}
            actionPending={actionPending}
            onStatus={(s) => perform(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) }))}
            onSend={() => {
              void act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/send`, { method: "POST", body: JSON.stringify({}) }))
                .then(() => toast({ title: t("billing.shared"), variant: "success" }))
                .catch(() => toast({ title: t("billing.action_failed"), description: t("billing.try_again"), variant: "danger" }));
            }}
            onConvert={() => perform(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/convert`, { method: "POST", body: JSON.stringify({}) }))}
            onRecordPayment={(amount, method, idempotencyKey) => act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/payments`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ amount, method }) }))}
            onDelete={() => setConfirmDelete(true)}
            onEdit={() => setEditOpen(true)}
          />
        ) : (
          <div className="flex-1 grid place-items-center p-4 text-muted-foreground text-sm">
            {documentError ? <div role="alert" className="text-center"><p>{t("billing.document_failed")}</p><button onClick={() => activeId && loadDoc(activeId)} className="mt-2 text-primary font-semibold underline">{t("billing.retry")}</button></div> : t(activeId ? "billing.loading" : "billing.select")}
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
