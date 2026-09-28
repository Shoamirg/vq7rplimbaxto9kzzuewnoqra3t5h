import type { InvoiceStatus, LineKind, PaymentMethodT } from "@/lib/api/types";

export function money(n: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, currencyDisplay: currency === "USD" ? "symbol" : "code",
    minimumFractionDigits: currency === "UZS" ? 0 : 2,
    maximumFractionDigits: currency === "UZS" ? 0 : 2,
  }).format(n ?? 0);
}

// Status → label + pill styling. Estimate statuses lean blue/purple; invoice
// statuses lean green/amber/red — so the two are instantly distinguishable.
export const STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "text-slate-500 bg-slate-100" },
  sent: { label: "Sent", cls: "text-purple-600 bg-purple-50" },
  viewed: { label: "Viewed", cls: "text-purple-600 bg-purple-50" },
  approved: { label: "Approved", cls: "text-emerald-600 bg-emerald-50" },
  rejected: { label: "Rejected", cls: "text-red-600 bg-red-50" },
  changes_requested: { label: "Changes requested", cls: "text-amber-600 bg-amber-50" },
  expired: { label: "Expired", cls: "text-slate-500 bg-slate-100" },
  issued: { label: "Issued", cls: "text-blue-600 bg-blue-50" },
  partial: { label: "Partial", cls: "text-amber-600 bg-amber-50" },
  paid: { label: "Paid", cls: "text-emerald-600 bg-emerald-50" },
  overdue: { label: "Overdue", cls: "text-red-600 bg-red-50" },
  void: { label: "Void", cls: "text-slate-500 bg-slate-100" },
  refunded: { label: "Refunded", cls: "text-slate-600 bg-slate-100" },
};

export const LINE_ICON: Record<LineKind, string> = {
  labor: "🔧", part: "📦", fee: "＋", discount: "％",
};

export const METHOD_ICON: Record<PaymentMethodT, string> = {
  cash: "💵", card: "💳", bank_transfer: "🏦", online: "🌐",
};

export const VIEWS: { key: string; label: string; icon: string; count: string | null }[] = [
  { key: "invoices", label: "Invoices", icon: "🧾", count: "invoices" },
  { key: "estimates", label: "Estimates", icon: "📝", count: "estimates" },
  { key: "payments", label: "Payments", icon: "💳", count: "payments" },
  { key: "overdue", label: "Overdue", icon: "⚠", count: "overdue" },
  { key: "awaiting", label: "Awaiting payment", icon: "◔", count: "awaiting" },
  { key: "drafts", label: "Drafts", icon: "✎", count: "drafts" },
  { key: "recurring", label: "Recurring", icon: "🔁", count: "recurring" },
];

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relTime(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
