"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Receipt } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { BillingResponse } from "@/lib/mini/types";
import { Card, Chip, Loading, ScreenHeader, SectionLabel, money } from "@/components/mini/ui";

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BillingPage() {
  const [b, setB] = useState<BillingResponse | null>(null);
  const [payNote, setPayNote] = useState(false);

  useEffect(() => {
    miniFetch<BillingResponse>("/billing").then(setB).catch(() => setB(null));
  }, []);

  if (!b) return <div><ScreenHeader title="Billing" /><Loading /></div>;

  const paid = b.invoices.filter((i) => i.balance <= 0.005);

  return (
    <div>
      <ScreenHeader title="Billing" />

      {/* One primary action */}
      {b.has_balance ? (
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-xl">
          <p className="text-sm text-white/70">Balance due</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{money(b.balance_due)}</p>
          {b.primary_invoice ? (
            <p className="mt-1 text-sm text-white/60">Invoice {b.primary_invoice.code}</p>
          ) : null}
          <button
            onClick={() => setPayNote(true)}
            className="mt-4 w-full rounded-2xl bg-green-500 py-3.5 text-base font-bold text-white transition active:scale-[0.99]"
          >
            Pay {money(b.balance_due)}
          </button>
          {payNote ? (
            <p className="mt-2 text-center text-xs text-white/70">
              Secure online payment is coming soon — pay in person or ask your advisor.
            </p>
          ) : null}
        </div>
      ) : (
        <Card className="!bg-green-50 !ring-green-200/60">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-green-600" />
            <div>
              <p className="font-semibold text-slate-900">No outstanding balance</p>
              <p className="text-sm text-green-700">You&apos;re all paid up. Thank you!</p>
            </div>
          </div>
        </Card>
      )}

      {/* Estimates awaiting the customer */}
      {b.estimates.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Estimates</SectionLabel>
          <div className="space-y-3">
            {b.estimates.map((e) => (
              <Card key={e.id}>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                    <FileText className="size-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Estimate {e.code}</p>
                    <p className="text-sm text-slate-500">{fmtDate(e.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{money(e.total)}</p>
                    <Chip tone={e.status === "approved" ? "green" : "amber"}>{e.status}</Chip>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Receipts */}
      {b.receipts.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Receipts</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {b.receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-2 py-3">
                  <Receipt className="size-5 text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 capitalize">{r.method ?? "Payment"}</p>
                    <p className="text-xs text-slate-400">{fmtDate(r.date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* Paid invoices */}
      {paid.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Paid invoices</SectionLabel>
          <Card className="!p-2">
            <ul className="divide-y divide-slate-100">
              {paid.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Invoice {i.code}</p>
                    <p className="text-xs text-slate-400">{fmtDate(i.created_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-500">{money(i.total)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
