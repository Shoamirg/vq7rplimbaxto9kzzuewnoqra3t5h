"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { cn, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BillingCounts, BillingKpis, BillingResponse, InvoiceDoc, InvoiceListItem } from "@/lib/api/types";
import { DocumentView } from "./document-view";
import { NewInvoiceModal } from "./new-invoice-modal";
import { STATUS_META, VIEWS, money, relTime } from "./shared";

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
  const { toast } = useToast();
  const { t } = useI18n();
  const searchParams = useSearchParams();

  // Open a specific document when deep-linked (e.g. from a notification:
  // /billing/<id> redirects here as ?doc=<id>).
  useEffect(() => {
    const docId = searchParams.get("doc");
    if (docId) setActiveId(docId);
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const data = await clientFetch<BillingResponse>(`/invoices?view=${view}`);
      setItems(data.items); setCounts(data.counts); setKpis(data.kpis);
      setActiveId((cur) => cur ?? data.items[0]?.id ?? null);
    } catch { /* keep */ }
  }, [view]);

  const loadDoc = useCallback(async (id: string) => {
    try { setDoc(await clientFetch<InvoiceDoc>(`/invoices/${id}`)); } catch { /* keep */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeId) loadDoc(activeId); }, [activeId, loadDoc]);

  const act = useCallback(async (fn: () => Promise<InvoiceDoc>) => {
    try {
      const updated = await fn();
      setDoc(updated);
      if (updated?.id && updated.id !== activeId) setActiveId(updated.id);
      load();
    } catch { /* keep */ }
  }, [activeId, load]);

  const title = VIEWS.find((v) => v.key === view)?.label ?? t("bill.title");
  const nounLc = (kind: string) => t(kind === "estimate" ? "bill.estimate_lc" : "bill.invoice_lc");
  const nounCap = (kind: string) => t(kind === "estimate" ? "bill.estimate" : "bill.invoice");

  return (
    <div className="h-full flex flex-col">
      {/* KPI header */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border bg-card shrink-0">
        <FileText className="size-5 text-primary" />
        <span className="font-bold text-foreground">{t("bill.title")}</span>
        {kpis && (
          <div className="flex items-center gap-5 ml-4">
            <Kpi k={t("bill.kpi_outstanding")} v={money(kpis.outstanding)} tone="text-red-600" />
            <Kpi k={t("bill.kpi_overdue")} v={money(kpis.overdue)} tone="text-amber-600" />
            <Kpi k={t("bill.kpi_paid_month")} v={money(kpis.paid_this_month)} tone="text-emerald-600" />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setNewKind("estimate")} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-border text-slate-600 hover:bg-muted">＋ {t("bill.estimate")}</button>
          <button onClick={() => setNewKind("invoice")} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">＋ {t("bill.invoice")}</button>
        </div>
      </div>

      {newKind && (
        <NewInvoiceModal
          kind={newKind}
          onClose={() => setNewKind(null)}
          onCreated={(created) => { setActiveId(created.id); load(); }}
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
          title={t("bill.delete_title", { kind: nounLc(doc.kind) })}
          message={t("bill.delete_message", { code: doc.code })}
          confirmLabel={t("bill.delete_label", { kind: nounCap(doc.kind) })}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await clientFetch(`/invoices/${doc.id}`, { method: "DELETE" });
              toast({ title: t("bill.deleted_toast", { noun: nounCap(doc.kind) }), description: doc.code, variant: "success" });
              setConfirmDelete(false);
              setActiveId(null); setDoc(null);
              load();
            } catch (err) {
              setConfirmDelete(false);
              const paid = err instanceof ClientApiError && err.status === 409;
              toast({
                title: paid ? t("bill.cant_delete_paid") : t("bill.delete_failed"),
                description: paid ? t("bill.delete_paid_hint") : t("bill.try_again"),
                variant: "danger",
              });
            }
          }}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* rail */}
        <nav className="w-52 shrink-0 bg-slate-900 text-slate-300 overflow-y-auto py-2">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("bill.documents")}</p>
          {VIEWS.map((v) => {
            const n = v.count && counts ? counts[v.count as keyof BillingCounts] : undefined;
            const active = view === v.key;
            const alert = v.key === "overdue";
            return (
              <button key={v.key} onClick={() => { setView(v.key); setActiveId(null); setDoc(null); }}
                className={cn("flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors",
                  active ? "bg-blue-600/20 text-white" : "hover:bg-slate-800")}>
                <span className="w-4 text-center">{v.icon}</span>
                <span className="flex-1 text-left truncate">{v.label}</span>
                {n ? <span className={cn("text-[11px] font-bold rounded-full px-1.5", active ? "bg-blue-600 text-white" : alert && n > 0 ? "bg-red-600 text-white" : "bg-slate-950 text-slate-400")}>{n}</span> : null}
              </button>
            );
          })}
        </nav>

        {/* queue */}
        <div className="w-[380px] shrink-0 bg-card border-r border-border flex flex-col">
          <div className="h-11 flex items-center px-4 border-b border-border"><span className="text-sm font-bold flex-1">{title}</span><span className="text-xs text-muted-foreground">{items.length}</span></div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("bill.empty")}</p>}
            {items.map((d) => {
              const st = STATUS_META[d.status];
              const active = activeId === d.id;
              return (
                <button key={d.id} onClick={() => setActiveId(d.id)}
                  className={cn("w-full text-left px-4 py-3 border-b border-border/70 border-l-[3px] transition-colors",
                    active ? "bg-primary/5 border-l-primary" : "border-l-transparent hover:bg-muted/40")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-px rounded", d.kind === "estimate" ? "text-purple-600 bg-purple-50" : "text-blue-600 bg-blue-50")}>{nounCap(d.kind)}</span>
                    <span className="font-mono text-[11.5px] font-bold text-slate-600">{d.code}</span>
                    <span className="ml-auto font-mono text-[14px] font-extrabold">{money(d.total)}</span>
                  </div>
                  <p className="text-[13.5px] font-bold mt-1.5">{d.customer_name ?? "—"}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">{d.vehicle_label ?? ""}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("text-[10.5px] font-bold px-2 py-0.5 rounded", st.cls)}>{st.label}</span>
                    {d.kind === "invoice" && d.balance > 0 && <span className="text-[11px] text-muted-foreground">{t("bill.balance")} {money(d.balance)}{d.due_date ? ` · ${t("bill.due_short")} ${new Date(d.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>}
                    {d.kind === "invoice" && d.balance <= 0 && <span className="text-[11px] text-muted-foreground">{d.paid_at ? t("bill.paid") : ""}</span>}
                    {d.kind === "estimate" && <span className="text-[11px] text-muted-foreground">{relTime(d.created_at)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* document */}
        {doc ? (
          <DocumentView
            doc={doc}
            onStatus={(s) => act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) }))}
            onSend={() => act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/send`, { method: "POST", body: JSON.stringify({}) }))}
            onConvert={() => act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/convert`, { method: "POST", body: JSON.stringify({}) }))}
            onRecordPayment={(amount, method) => act(() => clientFetch<InvoiceDoc>(`/invoices/${doc.id}/payments`, { method: "POST", body: JSON.stringify({ amount, method }) }))}
            onDelete={() => setConfirmDelete(true)}
            onEdit={() => setEditOpen(true)}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">{t("bill.select_doc")}</div>
        )}
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
