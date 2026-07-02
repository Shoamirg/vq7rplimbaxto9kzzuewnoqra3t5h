import type { Channel, ConvPriority, ConvStatus, ConvType } from "@/lib/api/types";

// Channel metadata — chip label + colour. Channel is *metadata*, so the same
// thread can interleave several.
export const CHANNEL_META: Record<Channel, { label: string; icon: string; cls: string }> = {
  telegram: { label: "Telegram", icon: "✈", cls: "text-sky-600 bg-sky-50 border-sky-200" },
  web: { label: "Web", icon: "💬", cls: "text-blue-600 bg-blue-50 border-blue-200" },
  phone: { label: "Call", icon: "☎", cls: "text-purple-600 bg-purple-50 border-purple-200" },
  email: { label: "Email", icon: "✉", cls: "text-amber-600 bg-amber-50 border-amber-200" },
  sms: { label: "SMS", icon: "▣", cls: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  internal: { label: "Internal", icon: "🔒", cls: "text-slate-600 bg-slate-100 border-slate-200" },
};

// Status → the "why is this open?" pill styling.
export const STATUS_STYLE: Record<ConvStatus, string> = {
  open: "text-red-600 bg-red-50",
  waiting_customer: "text-blue-600 bg-blue-50",
  waiting_technician: "text-amber-600 bg-amber-50",
  waiting_approval: "text-purple-600 bg-purple-50",
  snoozed: "text-slate-500 bg-slate-100",
  resolved: "text-emerald-600 bg-emerald-50",
};

export const PRIORITY_STYLE: Record<ConvPriority, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-slate-500 bg-slate-100",
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

// The work-queue views, in rail order. `count` maps to a key on InboxCounts
// (null = computed elsewhere / no badge).
export const VIEWS: { key: string; label: string; icon: string; count: keyof CountsShape | null }[] = [
  { key: "needs_reply", label: "Needs reply", icon: "🔔", count: "needs_reply" },
  { key: "assigned_me", label: "Assigned to me", icon: "🙋", count: "assigned_me" },
  { key: "mentions", label: "Mentions", icon: "＠", count: null },
  { key: "waiting_customer", label: "Waiting on customer", icon: "⏳", count: "waiting_customer" },
  { key: "waiting_technician", label: "Waiting on technician", icon: "🔧", count: "waiting_technician" },
  { key: "waiting_approval", label: "Waiting on approval", icon: "◔", count: "waiting_approval" },
  { key: "sla_breached", label: "SLA breached", icon: "⚠", count: null },
  { key: "unread", label: "Unread", icon: "●", count: "unread" },
  { key: "resolved", label: "Resolved today", icon: "✓", count: "resolved" },
];

type CountsShape = {
  needs_reply: number; assigned_me: number; waiting_customer: number;
  waiting_technician: number; waiting_approval: number; unread: number; resolved: number;
};

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
    case "customer": return "text-slate-600";
    case "dispatcher": return "text-blue-600";
    case "mechanic": return "text-emerald-600";
    case "manager": return "text-purple-600";
    default: return "text-muted-foreground";
  }
}
