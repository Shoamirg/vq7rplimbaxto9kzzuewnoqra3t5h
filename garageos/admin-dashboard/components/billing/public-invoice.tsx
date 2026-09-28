import type { InvoiceDoc, LineKind } from "@/lib/api/types";
import { type Locale, translate } from "@/lib/i18n/dictionaries";

const intlLocale: Record<Locale, string> = { en: "en-US", ru: "ru-RU", uz: "uz-Latn-UZ" };

const GROUPS: { kind: LineKind; labelKey: string }[] = [
  { kind: "labor", labelKey: "invoice.kind_labor" }, { kind: "part", labelKey: "invoice.kind_part" },
  { kind: "fee", labelKey: "invoice.kind_fee" }, { kind: "discount", labelKey: "invoice.kind_discount" },
];

// Customer-facing, read-only invoice/estimate. Rendered standalone at /invoice/[id]
// (no app shell) so it's clean to view on a phone and to print/save as PDF.
export function PublicInvoice({ doc, locale = "uz" }: { doc: InvoiceDoc; locale?: Locale }) {
  const isEstimate = doc.kind === "estimate";
  const accent = isEstimate ? "#2563eb" : "#16a34a";
  const t = (key: string) => translate(locale, key);
  const money = (n: number) => new Intl.NumberFormat(intlLocale[locale], {
    style: "currency", currency: doc.currency || "UZS",
  }).format(n || 0);
  const fmtDate = (iso?: string | null) => iso
    ? new Date(iso).toLocaleDateString(intlLocale[locale], { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div id="print-invoice" className="mx-auto w-[820px] max-w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* header */}
      <div className="px-7 py-6 text-white" style={{ background: "linear-gradient(120deg,#0F172A,#1E293B)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl text-lg font-extrabold" style={{ background: accent }}>G</span>
            <div>
              <div className="font-bold leading-tight">{t("public.garage")}</div>
              <div className="text-xs text-slate-300">{t("public.powered")}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-wide" style={{ color: accent }}>{t(isEstimate ? "public.estimate" : "public.invoice")}</div>
            <div className="text-xs text-slate-300 mt-0.5">{doc.code}</div>
            <div className="text-xs text-slate-300 mt-0.5">{doc.currency}</div>
            <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(255,255,255,.12)", color: "#e2e8f0" }}>{t(`public.status_${doc.status}`) === `public.status_${doc.status}` ? doc.status : t(`public.status_${doc.status}`)}</span>
          </div>
        </div>
      </div>

      {/* meta */}
      <div className="px-7 py-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-b border-slate-100">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("public.billed_to")}</div>
          <div className="font-semibold text-slate-800 mt-1">{doc.customer_name ?? "—"}</div>
        </div>
        {doc.vehicle_label ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("work.vehicle")}</div>
            <div className="font-semibold text-slate-800 mt-1">{doc.vehicle_label}</div>
          </div>
        ) : null}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(isEstimate ? "public.created" : "public.due")}</div>
          <div className="font-semibold text-slate-800 mt-1">{fmtDate(isEstimate ? doc.created_at : doc.due_date)}</div>
        </div>
      </div>

      {/* line items */}
      <div className="px-7 py-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
          <span>{t("invoice.description")}</span><span className="text-right">{t("public.qty")}</span><span className="text-right">{t("public.rate")}</span><span className="text-right">{t("public.amount")}</span>
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
                  <span className="text-right text-slate-500 tabular-nums">{money(li.unit_price)}</span>
                  <span className="text-right font-medium text-slate-800 tabular-nums">{money(li.line_total)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* totals */}
      <div className="px-7 py-4 flex justify-end">
        <div className="w-64 text-sm space-y-1.5">
          <Row label={t("public.subtotal")} value={money(doc.subtotal)} />
          {doc.discount_total > 0 && <Row label={t("public.discount")} value={`−${money(doc.discount_total)}`} />}
          <Row label={`${t("public.vat")} (${doc.tax_rate}%)`} value={money(doc.tax_total)} />
          <div className="flex justify-between pt-2 mt-1 border-t border-slate-200">
            <span className="font-bold text-slate-900">{t("public.total")}</span>
            <span className="font-bold text-slate-900 tabular-nums">{money(doc.total)}</span>
          </div>
          {doc.amount_paid > 0 && <Row label={t("public.paid")} value={`−${money(doc.amount_paid)}`} />}
          {doc.balance > 0 && (
            <div className="flex justify-between">
              <span className="font-bold" style={{ color: "#dc2626" }}>{t("public.balance")}</span>
              <span className="font-bold tabular-nums" style={{ color: "#dc2626" }}>{money(doc.balance)}</span>
            </div>
          )}
        </div>
      </div>

      {doc.notes ? <div className="px-7 pb-6 text-sm text-slate-500"><span className="font-semibold text-slate-600">{t("invoice.notes")}: </span>{doc.notes}</div> : null}
      <div className="px-7 py-4 bg-slate-50 text-xs text-slate-400 text-center">{t("public.contact")}</div>
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
