"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { Link2, Mail, Send, Share2 } from "lucide-react";
import {
  cn, useToast,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { InvoiceDoc, LineKind } from "@/lib/api/types";
import { LINE_ICON, METHOD_ICON } from "./shared";

const ABTN = "text-[12.5px] font-bold px-3.5 py-2 rounded-lg border border-border bg-card text-slate-600 inline-flex items-center gap-1.5 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-wait";
const TIMELINE_LABELS: Record<string, string> = {
  "Estimate created": "estimate_created", "Estimate sent": "estimate_sent",
  "Estimate approved": "estimate_approved", "Estimate declined": "estimate_rejected",
  "Invoice issued": "invoice_issued", "Payment received": "payment_received",
  "Invoice paid": "invoice_paid", "Refund issued": "refund_issued",
};

export function DocumentView({
  doc, actionPending, onStatus, onSend, onConvert, onRecordPayment, onDelete, onEdit,
}: {
  doc: InvoiceDoc;
  actionPending: boolean;
  onStatus: (s: string) => void;
  onSend: () => void;
  onConvert: () => void;
  onRecordPayment: (amount: number, method: string, idempotencyKey: string) => Promise<void>;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const hasPayments = doc.amount_paid > 0 || doc.payments.length > 0;
  const canEdit = !hasPayments;
  const { toast } = useToast();
  const { t, fmt } = useI18n();
  const money = (n: number) => fmt.money(n, doc.currency);
  const fmtDate = (iso: string | null) => fmt.date(iso);
  const timelineTitle = (title: string) => {
    const [label, ...suffix] = title.split(" · ");
    return TIMELINE_LABELS[label] ? [t(`billing.timeline_${TIMELINE_LABELS[label]}`), ...suffix].join(" · ") : title;
  };
  const timelineDetail = (title: string, detail: string) => {
    if (!/^(Payment received|Refund issued) · /.test(title)) return detail;
    const [value, method] = detail.split(" · ");
    const numeric = value.replace(/^(\$|[A-Z]{3}\s+)/, "").replaceAll(",", "");
    if (!/^\d+(\.\d+)?$/.test(numeric)) return detail;
    const methodKey = method === "bank_transfer" ? "bank" : method;
    return money(Number(numeric)) + (methodKey ? ` · ${t(`billing.method_${methodKey}`)}` : "");
  };
  const noun = t(doc.kind === "estimate" ? "public.estimate" : "public.invoice");
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/invoice/${doc.id}` : "";

  const copyLink = () =>
    navigator.clipboard.writeText(shareLink)
      .then(() => toast({ title: t("billing.link_copied"), description: t("billing.link_copied_hint"), variant: "success" }))
      .catch(() => toast({ title: t("billing.copy_failed"), variant: "danger" }));

  const emailLink = () => {
    const subject = encodeURIComponent(`${noun} ${doc.code}`);
    const body = encodeURIComponent(`${t("billing.email_body", { kind: noun, code: doc.code })}\n${shareLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const sendTelegram = async () => {
    try {
      await clientFetch(`/invoices/${doc.id}/send-telegram`, { method: "POST", body: JSON.stringify({ link: shareLink }) });
      toast({ title: t("billing.telegram_sent"), description: t("billing.telegram_delivered", { kind: noun, code: doc.code }), variant: "success" });
    } catch (err) {
      const hint = err instanceof ClientApiError && err.status === 422 ? t("billing.telegram_unlinked") : t("billing.try_again");
      toast({ title: t("billing.telegram_failed"), description: hint, variant: "danger" });
    }
  };
  const isEstimate = doc.kind === "estimate";
  const [payOpen, setPayOpen] = useState(false);

  const groups: { kind: LineKind; labelKey: string }[] = [
    { kind: "labor", labelKey: "invoice.kind_labor" }, { kind: "part", labelKey: "invoice.kind_part" },
    { kind: "fee", labelKey: "invoice.kind_fee" }, { kind: "discount", labelKey: "invoice.kind_discount" },
  ];

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-muted/30 p-4 lg:p-6">
      {/* Action bar — identity-specific */}
      <div className="max-w-[820px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        {isEstimate ? (
          <>
            <button disabled={actionPending} onClick={onSend} className={cn(ABTN, "bg-blue-600 text-white border-blue-600 hover:bg-blue-700")}>✉ {t("billing.send")}</button>
            {doc.status !== "approved" && <button disabled={actionPending} onClick={() => onStatus("approved")} className={cn(ABTN, "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700")}>✓ {t("billing.approve")}</button>}
            {doc.status !== "rejected" && <button disabled={actionPending} onClick={() => onStatus("rejected")} className={cn(ABTN, "text-red-600")}>✕ {t("billing.reject")}</button>}
            <button disabled={actionPending} onClick={() => onStatus("changes_requested")} className={ABTN}>✎ {t("billing.request_changes")}</button>
            {doc.status === "approved" && <button disabled={actionPending} onClick={onConvert} className={cn(ABTN, "bg-slate-900 text-white border-slate-900 hover:bg-slate-800")}>→ {t("billing.convert_to_invoice")}</button>}
          </>
        ) : (
          <>
            <button disabled={actionPending} onClick={onSend} className={cn(ABTN, "bg-blue-600 text-white border-blue-600 hover:bg-blue-700")}>✉ {t("billing.send")}</button>
            {doc.balance > 0 && doc.status !== "void" && <button disabled={actionPending} onClick={() => setPayOpen(true)} className={cn(ABTN, "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700")}>＋ {t("billing.record_payment")}</button>}
            {doc.vehicle_id && <Link href={`/passport/${doc.vehicle_id}`} target="_blank" className={ABTN}>🏅 {t("billing.attach_passport")}</Link>}
          </>
        )}
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(ABTN, "gap-1.5")} aria-label={t("billing.share")}><Share2 className="size-3.5" /> {t("billing.share")}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem icon={<Link2 className="size-4" />} onClick={copyLink}>{t("billing.copy_link")}</DropdownMenuItem>
            <DropdownMenuItem icon={<Mail className="size-4" />} onClick={emailLink}>{t("billing.email")}</DropdownMenuItem>
            <DropdownMenuItem icon={<Send className="size-4" />} onClick={sendTelegram}>{t("billing.telegram")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canEdit && <button disabled={actionPending} onClick={onEdit} className={ABTN} aria-label={t("billing.edit")}>✎ {t("billing.edit")}</button>}
        <button onClick={() => window.print()} className={ABTN} aria-label={t("public.print")}>🖨 PDF</button>
        {!hasPayments && !(doc.kind === "invoice" && doc.appointment_id) && (
          <button disabled={actionPending} onClick={onDelete} className={cn(ABTN, "hover:text-red-600 hover:border-red-200")} aria-label={t("billing.delete")}>🗑 {t("billing.delete")}</button>
        )}
      </div>

      {/* the document (also the print target — see the print rules in globals.css) */}
      <div id="print-invoice" className="max-w-[820px] mx-auto bg-card border border-border rounded-2xl shadow-[0_10px_40px_-20px_rgba(0,0,0,.25)] overflow-hidden">
        {/* header */}
        <div className="relative px-4 sm:px-7 py-6 text-white" style={{ background: "linear-gradient(120deg,#0F172A,#1E293B)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-xl text-lg font-extrabold", isEstimate ? "bg-blue-600" : "bg-emerald-600")}>G</span>
            <div>
              <p className="text-[17px] font-extrabold">GarageOS Demo Workshop</p>
              <p className="text-[11.5px] text-slate-400">Precision Auto Care · Tashkent · +998 71 200 7000</p>
            </div>
            <div className="ml-auto text-right">
              <p className={cn("text-2xl font-extrabold tracking-wide", isEstimate ? "text-blue-300" : "text-emerald-300")}>
                {t(isEstimate ? "public.estimate" : "public.invoice")}
              </p>
              <p className="font-mono text-[13px] text-slate-300 mt-0.5">{doc.code}</p>
              <span className={cn("inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full",
                isEstimate ? "bg-blue-500/20 text-blue-200" : doc.status === "paid" ? "bg-emerald-500/20 text-emerald-200" : doc.is_overdue ? "bg-red-500/20 text-red-200" : "bg-amber-500/20 text-amber-200")}>
                ● {t(`public.status_${doc.status}`)}
              </span>
            </div>
          </div>
        </div>

        {/* meta */}
        <div className="flex flex-wrap gap-5 px-4 sm:px-7 py-5 border-b border-border">
          <Meta label={t("public.billed_to")}>
            <p className="text-sm font-bold">{doc.customer?.name ?? doc.customer_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.customer?.phone ?? ""} {doc.customer?.email ? "· " + doc.customer.email : ""}</p>
            {doc.customer && <Link href={`/customers/${doc.customer_id}`} className="text-[11px] text-primary hover:underline">{t("billing.customer_360")} →</Link>}
          </Meta>
          <Meta label={t("work.vehicle")}>
            <p className="text-sm font-bold">{doc.vehicle_label ?? "—"}</p>
            {doc.vehicle_id && <Link href={`/vehicles/${doc.vehicle_id}`} className="text-[11px] text-primary hover:underline">{t("work.vehicle")} →</Link>}
          </Meta>
          <div className="min-w-[180px]">
            <Row k={isEstimate ? t("public.created") : t("billing.issued")} v={fmtDate(doc.issued_at ?? doc.created_at)} />
            {!isEstimate && <Row k={t("public.due")} v={fmtDate(doc.due_date)} danger={doc.is_overdue} />}
            {doc.appointment_id && <Row k={t("billing.appointment")} v={t("billing.linked")} />}
            {doc.case_id && <Row k={t("billing.case")} v={t("billing.linked")} />}
            {doc.source_estimate_id && <Row k={t("billing.from_estimate")} v="✓" />}
          </div>
        </div>

        {/* line items */}
        <div className="px-4 sm:px-7 pt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold">
                <th className="text-left py-2.5 border-b border-border">{t("invoice.description")}</th>
                <th className="text-right py-2.5 border-b border-border w-24">{t("billing.qty_hours")}</th>
                <th className="text-right py-2.5 border-b border-border w-24">{t("public.rate")}</th>
                <th className="text-right py-2.5 border-b border-border w-28">{t("public.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rows = doc.line_items.filter((l) => l.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <Fragment key={g.kind}>
                    <tr><td colSpan={4} className="pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{LINE_ICON[g.kind]} {t(g.labelKey)}</td></tr>
                    {rows.map((l) => (
                      <tr key={l.id} className="text-[13px] border-b border-slate-100">
                        <td className="py-2 font-semibold">{l.description}</td>
                        <td className="py-2 text-right font-mono">{g.kind === "labor" ? `${fmt.number(l.quantity)} ${t("billing.hours")}` : fmt.number(l.quantity)}</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">{money(l.unit_price)}</td>
                        <td className={cn("py-2 text-right font-mono", g.kind === "discount" && "text-emerald-600")}>{g.kind === "discount" ? "−" : ""}{money(l.line_total)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* totals */}
        <div className="flex justify-end px-4 sm:px-7 py-4">
          <div className="w-full max-w-[280px]">
            <TRow k={t("public.subtotal")} v={money(doc.subtotal)} />
            {doc.discount_total > 0 && <TRow k={t("public.discount")} v={"−" + money(doc.discount_total)} green />}
            <TRow k={`${t("public.vat")} (${doc.tax_rate}%)`} v={money(doc.tax_total)} />
            <div className="flex justify-between text-lg font-extrabold border-t-2 border-border mt-1 pt-2.5">
              <span>{t("public.total")}</span><span className="font-mono">{money(doc.total)}</span>
            </div>
            {!isEstimate && (
              <>
                <TRow k={t("public.paid")} v={"−" + money(doc.amount_paid)} />
                <div className={cn("flex justify-between text-base font-extrabold", doc.balance > 0 ? "text-red-600" : "text-emerald-600")}>
                  <span>{doc.balance > 0 ? t("public.balance") : t("billing.paid_full")}</span><span className="font-mono">{money(doc.balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* recorded payments (invoice only) */}
        {!isEstimate && (
          <div className="flex flex-wrap gap-6 px-4 sm:px-7 py-5 border-t border-border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mb-2">{t("billing.payment_history")}</p>
              {doc.payments.length === 0 && <p className="text-xs text-muted-foreground">{t("billing.no_payments")}</p>}
              {doc.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-border last:border-0 text-[12.5px]">
                  <span className="grid size-6 place-items-center rounded-md bg-muted text-sm">{METHOD_ICON[p.method]}</span>
                  <div className="min-w-0 wrap-break-word">
                    <span className="font-bold">{t(`billing.kind_${p.kind}`)}</span> · {t(`billing.method_${p.method === "bank_transfer" ? "bank" : p.method}`)} <span className="text-muted-foreground">· {t(`billing.source_${p.source}`)}</span>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(p.received_at)}{p.reference ? ` · ${p.reference}` : ""}</div>
                  </div>
                  <span className={cn("ml-auto shrink-0 font-mono font-bold", p.kind === "refund" && "text-red-600")}>{p.kind === "refund" ? "−" : ""}{money(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* financial timeline */}
        <div className="px-4 sm:px-7 py-5 border-t border-border">
          <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mb-3">{t("billing.timeline")}</p>
          {doc.timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("billing.no_activity")}</p>
          ) : (
            <div className="relative pl-5">
              <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
              {doc.timeline.map((e, i) => (
                <div key={i} className="relative pb-3 last:pb-0">
                  <span className={cn("absolute left-[-15px] top-0.5 size-2.5 rounded-full ring-2 ring-card", isEstimate ? "bg-blue-500" : "bg-emerald-500")} />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium">{timelineTitle(e.title)}</p>
                    <p className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(e.date)}</p>
                  </div>
                  {e.detail && <p className="text-[11px] text-muted-foreground">{timelineDetail(e.title, e.detail)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* record-payment inline modal */}
      {payOpen && <PayModal balance={doc.balance} currency={doc.currency} onClose={() => setPayOpen(false)} onSubmit={onRecordPayment} />}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[180px]">
      <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">{label}</p>
      {children}
    </div>
  );
}
function Row({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return <div className="flex justify-between text-xs py-0.5"><span className="text-muted-foreground">{k}</span><span className={cn(danger && "text-red-600 font-semibold")}>{v}</span></div>;
}
function TRow({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return <div className={cn("flex justify-between text-[13px] py-1", green ? "text-emerald-600" : "text-slate-600")}><span>{k}</span><span className="font-mono">{v}</span></div>;
}

function PayModal({ balance, currency, onClose, onSubmit }: { balance: number; currency: string; onClose: () => void; onSubmit: (amount: number, method: string, idempotencyKey: string) => Promise<void> }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const parsedAmount = Number(amount);
  const roundedAmount = Math.round(parsedAmount * 100) / 100;
  const valid = amount.trim() !== "" && Number.isFinite(parsedAmount) && roundedAmount > 0 && roundedAmount <= balance;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!valid) {
      setError(t(Number.isFinite(parsedAmount) && parsedAmount > balance ? "billing.payment_exceeds_balance" : "billing.payment_invalid"));
      return;
    }
    submitting.current = true; setBusy(true); setError(null);
    try {
      await onSubmit(parsedAmount, method, idempotencyKey);
      toast({ title: t("billing.saved"), variant: "success" });
      onClose();
    } catch (err) {
      const key = err instanceof ClientApiError && err.code === "PAYMENT_EXCEEDS_BALANCE" ? "billing.payment_exceeds_balance"
        : err instanceof ClientApiError && err.status === 409 ? "billing.payment_state_changed"
        : err instanceof ClientApiError && err.status === 422 ? "billing.payment_invalid" : "billing.payment_failed";
      setError(t(key));
    } finally {
      submitting.current = false; setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) onClose(); }}>
      <DialogContent hideClose aria-label={t("billing.record_payment")} className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto p-5">
        <DialogTitle className="text-base font-bold mb-2">{t("billing.record_payment")}</DialogTitle>
        <DialogDescription className="mb-3">{t("public.balance")}: {fmt.money(balance, currency)}</DialogDescription>
        <form onSubmit={save}>
        <label htmlFor="payment-amount" className="text-xs font-semibold text-muted-foreground">{t("public.amount")}</label>
        <input id="payment-amount" value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value); setError(null); }} inputMode="decimal" autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? "payment-error" : undefined}
          className="w-full mt-1 mb-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:ring-1 focus:ring-primary" />
        <label htmlFor="payment-method" className="text-xs font-semibold text-muted-foreground">{t("billing.payment_method")}</label>
        <select id="payment-method" value={method} disabled={busy} onChange={(e) => { setMethod(e.target.value); setError(null); }} className="w-full mt-1 mb-4 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden">
          <option value="card">{t("billing.method_card")}</option><option value="cash">{t("billing.method_cash")}</option>
          <option value="bank_transfer">{t("billing.method_bank")}</option><option value="online">{t("billing.method_online")}</option>
        </select>
        {error && <p id="payment-error" role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 items-center justify-between">
          <button type="button" disabled={busy} onClick={onClose} className="px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50">{t("common.cancel")}</button>
          <button type="submit" disabled={busy || !valid} className="px-4 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white disabled:opacity-50">{busy ? t("billing.saving") : t("billing.record_payment")}</button>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
