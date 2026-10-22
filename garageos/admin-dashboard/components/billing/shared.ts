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
  draft: { label: "Draft", cls: "text-muted-foreground bg-muted" },
  sent: { label: "Sent", cls: "text-foreground bg-muted" },
  viewed: { label: "Viewed", cls: "text-foreground bg-muted" },
  approved: { label: "Approved", cls: "text-status-success bg-status-success/10" },
  rejected: { label: "Rejected", cls: "text-status-danger bg-status-danger/10" },
  changes_requested: { label: "Changes requested", cls: "text-status-warning bg-status-warning/10" },
  expired: { label: "Expired", cls: "text-muted-foreground bg-muted" },
  issued: { label: "Issued", cls: "text-foreground bg-muted" },
  partial: { label: "Partial", cls: "text-status-warning bg-status-warning/10" },
  paid: { label: "Paid", cls: "text-status-success bg-status-success/10" },
  overdue: { label: "Overdue", cls: "text-status-danger bg-status-danger/10" },
  void: { label: "Void", cls: "text-muted-foreground bg-muted" },
  refunded: { label: "Refunded", cls: "text-muted-foreground bg-muted" },
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
