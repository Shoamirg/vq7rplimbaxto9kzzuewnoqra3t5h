"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Receipt } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import { useMiniData } from "@/lib/mini/hooks";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { BillingDoc, BillingResponse } from "@/lib/mini/types";
import { Card, Chip, ListSkeleton, ScreenError, ScreenHeader, SectionLabel } from "@/components/mini/ui";

export default function BillingPage() {
  const { data: b, setData, loading, error, reload } = useMiniData<BillingResponse>("/billing");
  const { t, fmt } = useI18n();
  const [payNote, setPayNote] = useState(false);

  if (error) return <div><ScreenHeader title={t("mini.billing.title")} /><ScreenError onRetry={reload} /></div>;
  if (loading || !b) return <div><ScreenHeader title={t("mini.billing.title")} /><ListSkeleton /></div>;

  const balanceText = Object.entries(b.balances_by_currency ?? { [b.balance_currency ?? "USD"]: b.balance_due }).filter(([, amount]) => amount > 0.005).map(([currency, amount]) => fmt.money(amount, currency)).join(" · ");

  const paid = b.invoices.filter((i) => i.balance <= 0.005);

  function patchEstimate(updated: BillingDoc) {
    setData((prev) =>
      prev ? { ...prev, estimates: prev.estimates.map((e) => (e.id === updated.id ? updated : e)) } : prev,
    );
  }

  return (
    <div>
      <ScreenHeader title={t("mini.billing.title")} />

      {/* One primary action */}
      {b.has_balance ? (
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-xl">
          <p className="text-sm text-white/70">{t("mini.home.balance_due")}</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{balanceText}</p>
          {b.primary_invoice ? (
            <p className="mt-1 text-sm text-white/60">{t("mini.home.invoice_n", { code: b.primary_invoice.code })}</p>
          ) : null}
          <button
            onClick={() => {
              haptic("medium");
              setPayNote(true);
            }}
            className="mt-4 min-h-[48px] w-full rounded-2xl bg-green-500 py-3.5 text-base font-bold text-white transition motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {t("mini.billing.pay", { amount: balanceText })}
          </button>
          {payNote ? <p className="mt-2 text-center text-xs text-white/70">{t("mini.billing.pay_soon")}</p> : null}
        </div>
      ) : (
        <Card className="!bg-green-50 !ring-green-200/60">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-green-600" aria-hidden />
            <div>
              <p className="font-semibold text-slate-900">{t("mini.billing.no_balance")}</p>
              <p className="text-sm text-green-700">{t("mini.billing.no_balance_hint")}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Estimates awaiting the customer's decision */}
      {b.estimates.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>{t("mini.billing.estimates")}</SectionLabel>
          <div className="space-y-3">
            {b.estimates.map((e) => (
              <EstimateCard key={e.id} estimate={e} onChange={patchEstimate} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Receipts */}
      {b.receipts.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>{t("mini.billing.receipts")}</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {b.receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-2 py-3">
                  <Receipt className="size-5 text-slate-400" aria-hidden />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 capitalize">{r.method ? t("billing.method_" + (r.method === "bank_transfer" ? "bank" : r.method)) : t("mini.billing.payment")}</p>
                    <p className="text-xs text-slate-400">{fmt.date(r.date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{fmt.money(r.amount, r.currency ?? "USD")}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* Paid invoices */}
      {paid.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>{t("mini.billing.paid_invoices")}</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {paid.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t("mini.home.invoice_n", { code: i.code })}</p>
                    <p className="text-xs text-slate-400">{fmt.date(i.created_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-500">{fmt.money(i.total, i.currency ?? "USD")}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

const DECIDED = new Set(["approved", "rejected"]);

function EstimateCard({ estimate, onChange }: { estimate: BillingDoc; onChange: (d: BillingDoc) => void }) {
  const router = useRouter();
  const { t, fmt } = useI18n();
  const [busy, setBusy] = useState<"approve" | "decline" | "ask" | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const decided = DECIDED.has(estimate.status);

  async function decide(action: "approve" | "decline") {
    setBusy(action);
    try {
      const updated = await miniFetch<BillingDoc>(`/billing/estimates/${estimate.id}/${action}`, { method: "POST" });
      haptic(action === "approve" ? "success" : "warning");
      onChange(updated);
    } catch {
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  async function submitQuestion() {
    const body = question.trim();
    if (!body) return;
    setBusy("ask");
    try {
      const res = await miniFetch<{ conversation_id: string }>(`/billing/estimates/${estimate.id}/question`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      router.push(`/mini/messages/${res.conversation_id}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText className="size-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{t("mini.billing.estimate_n", { code: estimate.code })}</p>
          <p className="text-sm text-slate-500">{t("mini.billing.awaiting")}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900">{fmt.money(estimate.total, estimate.currency ?? "USD")}</p>
          {decided ? (
            <Chip tone={estimate.status === "approved" ? "green" : "red"}>{t(`mini.status.${estimate.status}`)}</Chip>
          ) : null}
        </div>
      </div>

      {!decided ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => decide("approve")}
              disabled={!!busy}
              className="min-h-[44px] rounded-xl bg-green-600 text-sm font-semibold text-white transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 disabled:opacity-40"
            >
              {busy === "approve" ? "…" : t("mini.billing.approve")}
            </button>
            <button
              onClick={() => decide("decline")}
              disabled={!!busy}
              className="min-h-[44px] rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-40"
            >
              {t("mini.billing.decline")}
            </button>
            <button
              onClick={() => {
                haptic("selection");
                setAsking((v) => !v);
              }}
              disabled={!!busy}
              aria-expanded={asking}
              className="min-h-[44px] rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-40"
            >
              {t("mini.billing.ask")}
            </button>
          </div>
          {asking ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuestion()}
                placeholder={t("mini.billing.ask_placeholder")}
                aria-label={t("mini.billing.ask_placeholder")}
                className="flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-900/[0.06] focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={submitQuestion}
                disabled={!question.trim() || !!busy}
                className="min-h-[40px] rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
              >
                {t("mini.billing.send")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
