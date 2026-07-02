import type { CaseSeverity, CaseStatus, CaseType } from "@/lib/api/types";

export const SEV_BAR: Record<CaseSeverity, string> = {
  critical: "border-l-red-600", high: "border-l-amber-500", medium: "border-l-blue-500", low: "border-l-slate-500",
};
export const SEV_TEXT: Record<CaseSeverity, string> = {
  critical: "text-red-400", high: "text-amber-400", medium: "text-blue-400", low: "text-slate-400",
};
export const SEV_DOT: Record<CaseSeverity, string> = {
  critical: "bg-red-600", high: "bg-amber-500", medium: "bg-blue-500", low: "bg-slate-400",
};

export const TYPE_ICON: Record<CaseType, string> = {
  emergency: "🚨", support: "💬", towing: "🚚", warranty: "🛡️", vip: "★",
};

// Lifecycle order for the progress stepper.
export const STEPS: { key: CaseStatus; label: string }[] = [
  { key: "new", label: "Reported" },
  { key: "acknowledged", label: "Verified" },
  { key: "assigned", label: "Dispatched" },
  { key: "en_route", label: "En Route" },
  { key: "in_progress", label: "Repair" },
  { key: "resolved", label: "Resolved" },
];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  new: "New", acknowledged: "Acknowledged", assigned: "Assigned", en_route: "En route",
  in_progress: "In progress", waiting_customer: "Waiting on customer", resolved: "Resolved", closed: "Closed",
};

// Next actions offered per status (drives the status buttons).
export const NEXT_STATUS: Partial<Record<CaseStatus, CaseStatus[]>> = {
  new: ["acknowledged", "assigned"],
  acknowledged: ["assigned"],
  assigned: ["en_route", "waiting_customer"],
  en_route: ["in_progress"],
  in_progress: ["waiting_customer", "resolved"],
  waiting_customer: ["in_progress", "resolved"],
};

export function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
