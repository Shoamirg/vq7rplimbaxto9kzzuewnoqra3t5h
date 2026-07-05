"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { cn } from "@garageos/design-system";

import type { InvoiceDoc, LineKind } from "@/lib/api/types";
import { LINE_ICON, METHOD_ICON, STATUS_META, fmtDate, money } from "./shared";

const ABTN = "text-[12.5px] font-bold px-3.5 py-2 rounded-lg border border-border bg-card text-slate-600 inline-flex items-center gap-1.5 hover:bg-muted transition-colors";

export function DocumentView({
  doc, onStatus, onSend, onConvert, onRecordPayment, onDelete, onEdit,
}: {
  doc: InvoiceDoc;
  onStatus: (s: string) => void;
  onSend: () => void;
  onConvert: () => void;
  onRecordPayment: (amount: number, method: string) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const canEdit = doc.amount_paid <= 0;
  const isEstimate = doc.kind === "estimate";
  const accent = isEstimate ? "blue" : "emerald";
  const st = STATUS_META[doc.status];
  const [payOpen, setPayOpen] = useState(false);

  const groups: { kind: LineKind; label: string }[] = [
    { kind: "labor", label: "Labour" }, { kind: "part", label: "Parts" },
    { kind: "fee", label: "Fees" }, { kind: "discount", label: "Discounts" },
  ];

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-muted/30 p-4 lg:p-6">
      {/* Action bar — identity-specific */}
      <div className="max-w-[820px] mx-auto mb-3 flex items-center gap-2 flex-wrap">
        {isEstimate ? (
          <>
            <button onClick={onSend} className={cn(ABTN, "bg-blue-600 text-white border-blue-600 hover:bg-blue-700")}>✉ Send</button>
            {doc.status !== "approved" && <button onClick={() => onStatus("approved")} className={cn(ABTN, "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700")}>✓ Approve</button>}
            {doc.status !== "rejected" && <button onClick={() => onStatus("rejected")} className={cn(ABTN, "text-red-600")}>✕ Reject</button>}
            <button onClick={() => onStatus("changes_requested")} className={ABTN}>✎ Request changes</button>
            {doc.status === "approved" && <button onClick={onConvert} className={cn(ABTN, "bg-slate-900 text-white border-slate-900 hover:bg-slate-800")}>→ Convert to invoice</button>}
          </>
        ) : (
          <>
            <button onClick={onSend} className={cn(ABTN, "bg-blue-600 text-white border-blue-600 hover:bg-blue-700")}>✉ Send</button>
            {doc.balance > 0 && <button onClick={() => setPayOpen(true)} className={cn(ABTN, "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700")}>＋ Record payment</button>}
            <Link href={`/passport/${doc.vehicle_id}`} target="_blank" className={ABTN}>🏅 Attach passport</Link>
          </>
        )}
        <div className="flex-1" />
        {canEdit && <button onClick={onEdit} className={ABTN} aria-label={`Edit ${doc.kind}`}>✎ Edit</button>}
        <button className={ABTN}>🖨 PDF</button>
        <button onClick={onDelete} className={cn(ABTN, "hover:text-red-600 hover:border-red-200")} aria-label={`Delete ${doc.kind}`}>🗑 Delete</button>
      </div>

      {/* the document */}
      <div className="max-w-[820px] mx-auto bg-card border border-border rounded-2xl shadow-[0_10px_40px_-20px_rgba(0,0,0,.25)] overflow-hidden">
        {/* header */}
        <div className="relative px-7 py-6 text-white" style={{ background: "linear-gradient(120deg,#0F172A,#1E293B)" }}>
          <div className="flex items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-xl text-lg font-extrabold", isEstimate ? "bg-blue-600" : "bg-emerald-600")}>G</span>
            <div>
              <p className="text-[17px] font-extrabold">GarageOS Demo Workshop</p>
              <p className="text-[11.5px] text-slate-400">Precision Auto Care · Tashkent · +998 71 200 7000</p>
            </div>
            <div className="ml-auto text-right">
              <p className={cn("text-2xl font-extrabold tracking-wide", isEstimate ? "text-blue-300" : "text-emerald-300")}>
                {isEstimate ? "ESTIMATE" : "INVOICE"}
              </p>
              <p className="font-mono text-[13px] text-slate-300 mt-0.5">{doc.code}</p>
              <span className={cn("inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full",
                isEstimate ? "bg-blue-500/20 text-blue-200" : doc.status === "paid" ? "bg-emerald-500/20 text-emerald-200" : doc.is_overdue ? "bg-red-500/20 text-red-200" : "bg-amber-500/20 text-amber-200")}>
                ● {isEstimate ? "Pending approval" : st.label}
              </span>
            </div>
          </div>
        </div>

        {/* meta */}
        <div className="flex flex-wrap gap-7 px-7 py-5 border-b border-border">
          <Meta label="Billed to">
            <p className="text-sm font-bold">{doc.customer?.name ?? doc.customer_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.customer?.phone ?? ""} {doc.customer?.email ? "· " + doc.customer.email : ""}</p>
            {doc.customer && <Link href={`/customers/${doc.customer_id}`} className="text-[11px] text-primary hover:underline">Customer 360 →</Link>}
          </Meta>
          <Meta label="Vehicle">
            <p className="text-sm font-bold">{doc.vehicle_label ?? "—"}</p>
            {doc.vehicle_id && <Link href={`/vehicles/${doc.vehicle_id}`} className="text-[11px] text-primary hover:underline">Vehicle →</Link>}
          </Meta>
          <div className="min-w-[180px]">
            <Row k={isEstimate ? "Created" : "Issued"} v={fmtDate(doc.issued_at ?? doc.created_at)} />
            {!isEstimate && <Row k="Due" v={fmtDate(doc.due_date)} danger={doc.is_overdue} />}
            {doc.appointment_id && <Row k="Appointment" v="linked" />}
            {doc.case_id && <Row k="Case" v="linked" />}
            {doc.source_estimate_id && <Row k="From estimate" v="✓" />}
          </div>
        </div>

        {/* line items */}
        <div className="px-7 pt-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold">
                <th className="text-left py-2.5 border-b border-border">Description</th>
                <th className="text-right py-2.5 border-b border-border w-24">Qty / Hrs</th>
                <th className="text-right py-2.5 border-b border-border w-24">Rate</th>
                <th className="text-right py-2.5 border-b border-border w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rows = doc.line_items.filter((l) => l.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <Fragment key={g.kind}>
                    <tr><td colSpan={4} className="pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{LINE_ICON[g.kind]} {g.label}</td></tr>
                    {rows.map((l) => (
                      <tr key={l.id} className="text-[13px] border-b border-slate-100">
                        <td className="py-2 font-semibold">{l.description}</td>
                        <td className="py-2 text-right font-mono">{g.kind === "labor" ? `${l.quantity} h` : l.quantity}</td>
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
        <div className="flex justify-end px-7 py-4">
          <div className="w-[280px]">
            <TRow k="Subtotal" v={money(doc.subtotal)} />
            {doc.discount_total > 0 && <TRow k="Discount" v={"−" + money(doc.discount_total)} green />}
            <TRow k={`VAT (${doc.tax_rate}%)`} v={money(doc.tax_total)} />
            <div className="flex justify-between text-lg font-extrabold border-t-2 border-border mt-1 pt-2.5">
              <span>Total</span><span className="font-mono">{money(doc.total)}</span>
            </div>
            {!isEstimate && (
              <>
                <TRow k="Paid" v={"−" + money(doc.amount_paid)} />
                <div className={cn("flex justify-between text-base font-extrabold", doc.balance > 0 ? "text-red-600" : "text-emerald-600")}>
                  <span>{doc.balance > 0 ? "Balance due" : "Paid in full"}</span><span className="font-mono">{money(doc.balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* payments + QR (invoice only) */}
        {!isEstimate && (
          <div className="flex flex-wrap gap-6 px-7 py-5 border-t border-border bg-muted/20">
            <div className="flex-1 min-w-[240px]">
              <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Payment history</p>
              {doc.payments.length === 0 && <p className="text-xs text-muted-foreground">No payments yet.</p>}
              {doc.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-border last:border-0 text-[12.5px]">
                  <span className="grid size-6 place-items-center rounded-md bg-muted text-sm">{METHOD_ICON[p.method]}</span>
                  <div>
                    <span className="font-bold capitalize">{p.kind}</span> · {p.method.replace("_", " ")} <span className="text-muted-foreground">· {p.source}</span>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(p.received_at)}{p.reference ? ` · ${p.reference}` : ""}</div>
                  </div>
                  <span className={cn("ml-auto font-mono font-bold", p.kind === "refund" && "text-red-600")}>{p.kind === "refund" ? "−" : ""}{money(p.amount)}</span>
                </div>
              ))}
            </div>
            {doc.balance > 0 && (
              <div className="text-center">
                <div className="size-[110px] mx-auto rounded-xl border-[6px] border-slate-900" style={{ background: "repeating-linear-gradient(0deg,#0B1220 0 4px,transparent 4px 8px),repeating-linear-gradient(90deg,#0B1220 0 4px,transparent 4px 8px)", backgroundSize: "8px 8px" }} />
                <p className="text-[11px] font-semibold text-muted-foreground mt-2">Scan to pay {money(doc.balance)}</p>
                <p className="text-[10px] text-muted-foreground/70">Visa · Apple Pay · Bank</p>
              </div>
            )}
          </div>
        )}

        {/* financial timeline */}
        <div className="px-7 py-5 border-t border-border">
          <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Financial timeline</p>
          {doc.timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="relative pl-5">
              <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
              {doc.timeline.map((e, i) => (
                <div key={i} className="relative pb-3 last:pb-0">
                  <span className={cn("absolute -left-[15px] top-0.5 size-2.5 rounded-full ring-2 ring-card", isEstimate ? "bg-blue-500" : "bg-emerald-500")} />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium">{e.title}</p>
                    <p className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(e.date)}</p>
                  </div>
                  {e.detail && <p className="text-[11px] text-muted-foreground">{e.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* record-payment inline modal */}
      {payOpen && <PayModal balance={doc.balance} onClose={() => setPayOpen(false)} onSubmit={(a, m) => { onRecordPayment(a, m); setPayOpen(false); }} />}
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

function PayModal({ balance, onClose, onSubmit }: { balance: number; onClose: () => void; onSubmit: (amount: number, method: string) => void }) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState("card");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={onClose}>
      <div className="w-[360px] rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-bold mb-3">Record payment</p>
        <label className="text-xs font-semibold text-muted-foreground">Amount</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
          className="w-full mt-1 mb-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
        <label className="text-xs font-semibold text-muted-foreground">Method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full mt-1 mb-4 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
          <option value="card">Card</option><option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option><option value="online">Online</option>
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 text-sm font-semibold text-muted-foreground">Cancel</button>
          <button onClick={() => onSubmit(parseFloat(amount) || 0, method)} className="px-4 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white">Record {money(parseFloat(amount) || 0)}</button>
        </div>
      </div>
    </div>
  );
}
