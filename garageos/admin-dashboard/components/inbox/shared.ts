import type { Channel, ConvPriority, ConvStatus, ConvType, InboxCounts } from "@/lib/api/types";
import type { Translate } from "../operations/shared";

export function inboxEnumLabel(t: Translate, kind: string, value: string | null | undefined) {
  const key = `inbox.${kind}.${value}`, label = t(key);
  return label === key ? t("ops.unknown") : label;
}

// Channel metadata — chip label + colour. Channel is *metadata*, so the same
// thread can interleave several.
export const CHANNEL_META: Record<Channel, { label: string; icon: string; cls: string }> = {
  telegram: { label: "Telegram", icon: "✈", cls: "text-sky-700 bg-sky-50 border-sky-200" },
  web: { label: "Web", icon: "💬", cls: "text-blue-700 bg-blue-50 border-blue-200" },
  phone: { label: "Call", icon: "☎", cls: "text-purple-700 bg-purple-50 border-purple-200" },
  email: { label: "Email", icon: "✉", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  sms: { label: "SMS", icon: "▣", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  internal: { label: "Internal", icon: "🔒", cls: "text-slate-600 bg-slate-100 border-slate-200" },
};

// Status → the "why is this open?" pill styling.
export const STATUS_STYLE: Record<ConvStatus, string> = {
  open: "text-red-700 bg-red-50",
  waiting_customer: "text-blue-700 bg-blue-50",
  waiting_technician: "text-amber-700 bg-amber-50",
  waiting_approval: "text-purple-700 bg-purple-50",
  snoozed: "text-slate-600 bg-slate-100",
  resolved: "text-emerald-700 bg-emerald-50",
};

export const PRIORITY_STYLE: Record<ConvPriority, string> = {
  high: "text-red-700 bg-red-50",
  medium: "text-amber-700 bg-amber-50",
  low: "text-slate-600 bg-slate-100",
};

export const CONV_TYPE_ICON: Record<ConvType, string> = {
  emergency: "🛰️", support: "💬", warranty: "🛡️", vip: "★", general: "📋",
};

// Distinct visual treatment per activity kind — so a mixed timeline scans fast.
// Keyed by the notification `category` (events) or "message".
export const ACTIVITY_ICON: Record<string, string> = {
  message: "💬",
  mention: "＠",
  appointment: "📅",
  vehicle: "🚗",
  operations: "👤",
  emergency: "🚨",
  passport: "🏅",
  finance: "💳",
  sla: "⚠️",
  ai: "🤖",
  system: "🔔",
};

export function activityIcon(item: { type: string; category?: string }): string {
  if (item.type === "message") return ACTIVITY_ICON.message;
  return ACTIVITY_ICON[item.category ?? "system"] ?? ACTIVITY_ICON.system;
}

// Every badge is the server's own view count within channel/type/search filters.
export const VIEWS: { key: string; label: string; icon: string; count: keyof InboxCounts }[] = [
  { key: "all", label: "inbox.view.all", icon: "▤", count: "all" },
  { key: "needs_reply", label: "inbox.view.needs_reply", icon: "🔔", count: "needs_reply" },
  { key: "assigned_me", label: "inbox.view.assigned_me", icon: "🙋", count: "assigned_me" },
  { key: "mentions", label: "inbox.view.mentions", icon: "＠", count: "mentions" },
  { key: "waiting_customer", label: "inbox.view.waiting_customer", icon: "⏳", count: "waiting_customer" },
  { key: "waiting_technician", label: "inbox.view.waiting_technician", icon: "🔧", count: "waiting_technician" },
  { key: "waiting_approval", label: "inbox.view.waiting_approval", icon: "◔", count: "waiting_approval" },
  { key: "sla_breached", label: "inbox.view.sla_breached", icon: "⚠", count: "sla_breached" },
  { key: "unread", label: "inbox.view.unread", icon: "●", count: "unread" },
  { key: "resolved", label: "inbox.view.resolved", icon: "✓", count: "resolved" },
  { key: "snoozed", label: "inbox.view.snoozed", icon: "◷", count: "snoozed" },
];

export const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "emergency", label: "Emergency" },
  { key: "support", label: "Support" },
  { key: "warranty", label: "Warranty" },
  { key: "vip", label: "VIP" },
  { key: "general", label: "General" },
];

export const CHANNEL_FILTERS: { key: Channel; label: string; icon: string }[] = [
  { key: "telegram", label: "Telegram", icon: "✈" },
  { key: "phone", label: "Phone", icon: "☎" },
  { key: "email", label: "Email", icon: "✉" },
  { key: "sms", label: "SMS", icon: "▣" },
  { key: "web", label: "Web", icon: "💬" },
  { key: "internal", label: "Internal", icon: "🔒" },
];

export function relTime(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// A short label for who a message is from.
export function roleColor(role: string): string {
  switch (role) {
    case "customer": return "text-slate-600 dark:text-slate-300";
    case "dispatcher": return "text-blue-600 dark:text-blue-300";
    case "mechanic": return "text-emerald-600 dark:text-emerald-300";
    case "manager": return "text-purple-600 dark:text-purple-300";
    default: return "text-muted-foreground";
  }
}
