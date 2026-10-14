import type { CaseMechanic, CaseSeverity, CaseStatus, CaseType } from "@/lib/api/types";
import { DICTIONARIES, type TParams } from "@/lib/i18n/dictionaries";
export type Translate = (key: string, params?: TParams) => string;
export const operationControl = "min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
export const SEV_BAR: Record<CaseSeverity, string> = {
  critical: "border-l-red-600", high: "border-l-amber-500", medium: "border-l-blue-500", low: "border-l-slate-500",
};
export const TYPE_ICON: Record<CaseType, string> = { emergency: "🚨", support: "💬", towing: "🚚", warranty: "🛡️", vip: "★" };
export const NEXT_STATUS: Partial<Record<CaseStatus, CaseStatus[]>> = {
  new: ["acknowledged", "assigned"], acknowledged: ["assigned"], assigned: ["en_route", "waiting_customer"],
  en_route: ["in_progress"], in_progress: ["waiting_customer", "resolved"], waiting_customer: ["in_progress", "resolved"],
};
export function enumLabel(t: Translate, kind: string, value: string | null | undefined) {
  const key = `ops.${kind}.${value}`;
  return t(Object.hasOwn(DICTIONARIES.en, key) ? key : "ops.unknown");
}
export function fmtTimer(seconds: number, t: Translate, number: (n: number) => string) {
  const bounded = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return t("ops.duration", { minutes: number(Math.floor(bounded / 60)), seconds: number(bounded % 60) });
}
export function relTime(iso: string, now: number, t: Translate, number: (n: number) => string) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return t("ops.unknown");
  if (minutes < 1) return t("ops.just_now");
  if (minutes < 60) return t("ops.minutes_ago", { count: number(minutes) });
  if (minutes < 1440) return t("ops.hours_ago", { count: number(Math.floor(minutes / 60)) });
  return t("ops.days_ago", { count: number(Math.floor(minutes / 1440)) });
}
// Shortest UUID prefix distinguishing equal names; independent of roster order.
export function mechanicLabels(mechanics: CaseMechanic[]) {
  return new Map(mechanics.map(mechanic => {
    const peers = mechanics.filter(other => other.name === mechanic.name && other.id !== mechanic.id);
    if (!peers.length) return [mechanic.id, mechanic.name];
    let length = 8;
    while (length < mechanic.id.length && peers.some(other => other.id.slice(0, length) === mechanic.id.slice(0, length))) length++;
    return [mechanic.id, `${mechanic.name} · ${mechanic.id.slice(0, length)}`];
  }));
}
