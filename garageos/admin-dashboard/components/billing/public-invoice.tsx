"use client";

import type { InvoiceDoc, LineKind } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/dictionaries";
import { formatDate, formatMoney } from "@/lib/i18n/format";

// Money/date formatters bound to the active UI language.
const makeFmt = (locale: Locale) => ({
  money: (n: number, ccy = "USD") => formatMoney(locale, n, ccy || "USD"),
  fmtDate: (iso?: string | null) =>
    iso ? formatDate(locale, iso, { month: "short", day: "numeric", year: "numeric" }) : "—",
});

const GROUPS: { kind: LineKind; labelKey: string }[] = [
  { kind: "labor", labelKey: "bill.group_labor" }, { kind: "part", labelKey: "bill.group_parts" },
  { kind: "fee", labelKey: "bill.group_fees" }, { kind: "discount", labelKey: "bill.group_discounts" },
];

// Customer-facing, read-only invoice/estimate. Rendered standalone at /invoice/[id]
// (no app shell) so it's clean to view on a phone and to print/save as PDF.
export function PublicInvoice({ doc }: { doc: InvoiceDoc }) {
  const { t, locale } = useI18n();
  const { money, fmtDate } = makeFmt(locale);
  const isEstimate = doc.kind === "estimate";
  const accent = isEstimate ? "#2563eb" : "#16a34a";
  const nounLc = isEstimate ? t("bill.estimate_lc") : t("bill.invoice_lc");

  return (
    <div id="print-invoice" className="mx-auto w-[820px] max-w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* header */}
      <div className="px-7 py-6 text-white" style={{ background: "linear-gradient(120deg,#0F172A,#1E293B)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl text-lg font-extrabold" style={{ background: accent }}>G</span>
            <div>
              <div className="font-bold leading-tight">{t("bill.your_garage")}</div>
              <div className="text-xs text-slate-300">{t("bill.powered_by")}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-wide" style={{ color: accent }}>{isEstimate ? t("bill.estimate_upper") : t("bill.invoice_upper")}</div>
            <div className="text-xs text-slate-300 mt-0.5">{doc.code}</div>
            <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(255,255,255,.12)", color: "#e2e8f0" }}>{doc.status}</span>
          </div>
        </div>
      </div>

      {/* meta */}
      <div className="px-7 py-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-b border-slate-100">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("bill.billed_to")}</div>
          <div className="font-semibold text-slate-800 mt-1">{doc.customer_name ?? "—"}</div>
        </div>
        {doc.vehicle_label ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("bill.vehicle")}</div>
            <div className="font-semibold text-slate-800 mt-1">{doc.vehicle_label}</div>
          </div>
        ) : null}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{isEstimate ? t("bill.created") : t("bill.due")}</div>
          <div className="font-semibold text-slate-800 mt-1">{fmtDate(isEstimate ? doc.created_at : doc.due_date)}</div>
        </div>
      </div>

      {/* line items */}
      <div className="px-7 py-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
          <span>{t("bill.col_description")}</span><span className="text-right">{t("bill.col_qty")}</span><span className="text-right">{t("bill.col_rate")}</span><span className="text-right">{t("bill.col_amount")}</span>
        </div>
        {GROUPS.map((g) => {
          const rows = doc.line_items.filter((li) => li.kind === g.kind);
          if (!rows.length) return null;
          return (
            <div key={g.kind}>
              <div className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{t(g.labelKey)}</div>
              {rows.map((li) => (
                <div key={li.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-1.5 text-sm border-b border-slate-50">
                  <span className="text-slate-800">{li.description}</span>
                  <span className="text-right text-slate-500 tabular-nums">{li.quantity}</span>
                  <span className="text-right text-slate-500 tabular-nums">{money(li.unit_price, doc.currency)}</span>
                  <span className="text-right font-medium text-slate-800 tabular-nums">{money(li.line_total, doc.currency)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* totals */}
      <div className="px-7 py-4 flex justify-end">
        <div className="w-64 text-sm space-y-1.5">
          <Row label={t("bill.subtotal")} value={money(doc.subtotal, doc.currency)} />
          {doc.discount_total > 0 && <Row label={t("bill.discount")} value={`−${money(doc.discount_total, doc.currency)}`} />}
          <Row label={t("bill.vat", { rate: doc.tax_rate })} value={money(doc.tax_total, doc.currency)} />
          <div className="flex justify-between pt-2 mt-1 border-t border-slate-200">
            <span className="font-bold text-slate-900">{t("bill.total")}</span>
            <span className="font-bold text-slate-900 tabular-nums">{money(doc.total, doc.currency)}</span>
          </div>
          {doc.amount_paid > 0 && <Row label={t("bill.paid")} value={`−${money(doc.amount_paid, doc.currency)}`} />}
          {doc.balance > 0 && (
            <div className="flex justify-between">
              <span className="font-bold" style={{ color: "#dc2626" }}>{t("bill.balance_due")}</span>
              <span className="font-bold tabular-nums" style={{ color: "#dc2626" }}>{money(doc.balance, doc.currency)}</span>
            </div>
          )}
        </div>
      </div>

      {doc.notes ? <div className="px-7 pb-6 text-sm text-slate-500"><span className="font-semibold text-slate-600">{t("bill.notes_prefix")} </span>{doc.notes}</div> : null}
      <div className="px-7 py-4 bg-slate-50 text-xs text-slate-400 text-center">{t("bill.pub_footer", { kind: nounLc })}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
