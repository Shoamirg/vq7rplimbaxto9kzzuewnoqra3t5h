"use client";

import { Search } from "lucide-react";
import { cn } from "@garageos/design-system";

import type { InboxItem } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { enumLabel, fmtTimer, relTime } from "../operations/shared";
import { CHANNEL_META, PRIORITY_STYLE, STATUS_STYLE, inboxEnumLabel } from "./shared";

// Column 2 — the conversation list. Every row answers "why is this still open?"
// via the communication status line and any recorded summary.
export function ConversationList({
  items, activeId, onSelect, q, onQ, title, now, loadedAt, loading, verified, failed,
  total, offset, limit, onPage,
}: {
  items: InboxItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  q: string;
  onQ: (v: string) => void;
  title: string;
  now: number;
  loadedAt: number;
  loading: boolean;
  verified: boolean;
  failed: boolean;
  total: number | null;
  offset: number;
  limit: number;
  onPage: (offset: number) => void;
}) {
  const { t, fmt } = useI18n();
  const canPage = verified && !loading && !failed && total !== null;
  return (
    <div className="w-full min-w-0 min-h-0 flex-1 bg-card border-r border-border flex flex-col">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border shrink-0">
        <span className="text-sm font-bold text-foreground flex-1 truncate">{title}</span>
        {total !== null && <span className="text-xs text-muted-foreground">{fmt.number(total)}</span>}
      </div>
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} maxLength={200} onChange={(e) => onQ(e.target.value)} aria-label={t("inbox.search")} placeholder={t("inbox.search")}
            className="min-h-11 min-w-0 flex-1 bg-transparent py-2 text-xs text-foreground outline-hidden placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-solid" />
        </div>
      </div>

      <div role="region" aria-label={t("message.conversations")} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:outline-primary">
        {loading && !verified && <p role="status" className="p-4 text-sm">{t("ops.loading")}</p>}
        {items.length === 0 && verified && !loading && !failed && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("inbox.empty")}</p>
        )}
        {items.map((c) => {
          const ch = c.last_channel ? CHANNEL_META[c.last_channel] : null;
          const active = activeId === c.id;
          const unread = (c.unread_messages ?? 0) + (c.unread_activity ?? 0);
          const slaLive = c.sla_elapsed_seconds != null
            ? c.sla_elapsed_seconds + Math.max(0, Math.floor((now - loadedAt) / 1000))
            : null;
          return (
            <button key={c.id} onClick={() => onSelect(c.id)} aria-current={active ? "true" : undefined}
              className={cn("min-h-11 w-full text-left px-4 py-3 border-b border-border/70 border-l-[3px] transition-colors relative focus-visible:outline-2 focus-visible:outline-primary",
                active ? "bg-primary/5 border-l-primary" : unread > 0 ? "border-l-primary/60 hover:bg-muted/40" : "border-l-transparent hover:bg-muted/40")}>
              <div className="flex items-center gap-2">
                <span className={cn("text-[13.5px] text-foreground truncate", unread > 0 ? "font-bold" : "font-semibold")}>
                  {c.customer_name ?? c.subject ?? t("inbox.conversation")}
                </span>
                <span className={cn("text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded", PRIORITY_STYLE[c.priority])}>
                  {enumLabel(t, "severity", c.priority)}
                </span>
                {c.last_activity_at && <time dateTime={c.last_activity_at} title={fmt.date(c.last_activity_at)} className="ml-auto text-[11px] text-slate-600 dark:text-slate-300 shrink-0">{relTime(c.last_activity_at, now, t, fmt.number)}</time>}
              </div>
              {c.subject && c.customer_name && (
                <p className="text-[12.5px] font-medium text-foreground/90 mt-1 truncate">{c.subject}</p>
              )}
              {c.vehicle_label && <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{c.vehicle_label}</p>}

              <div className="mt-1.5">
                <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded", STATUS_STYLE[c.status])}>
                  {inboxEnumLabel(t, "status", c.status)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {ch && (
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded-full border", ch.cls)}>
                    {ch.icon} {inboxEnumLabel(t, "channel", c.last_channel)}
                  </span>
                )}
                {c.ai_summary && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-px rounded-full border border-indigo-200 bg-linear-to-r from-indigo-50 to-violet-50 text-indigo-700">
                    {t("inbox.stored_summary")} · {c.ai_summary}
                  </span>
                )}
                {slaLive != null && c.sla_tracking_active === true && (
                  <span className={cn("ml-auto text-[11px] font-mono font-bold", c.sla_breached ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
                    {fmtTimer(slaLive, t, fmt.number)}
                  </span>
                )}
                {unread > 0 && (
                  <span className="ml-auto inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {fmt.number(unread)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <nav aria-label={t("inbox.pages")} className="shrink-0 space-y-2 border-t border-border p-2">
        {total !== null && <p role="status" className="break-words text-center text-xs text-foreground">{t("inbox.results", { start: fmt.number(items.length ? offset + 1 : 0), end: fmt.number(items.length ? offset + items.length : 0), total: fmt.number(total) })}</p>}
        <div className="flex gap-2">
          <button className="min-h-11 min-w-11 flex-1 rounded-lg border border-border px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" disabled={!canPage || offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>{t("ops.previous")}</button>
          <button className="min-h-11 min-w-11 flex-1 rounded-lg border border-border px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" disabled={!canPage || offset + limit >= (total ?? 0)} onClick={() => onPage(offset + limit)}>{t("ops.next")}</button>
        </div>
      </nav>
    </div>
  );
}
