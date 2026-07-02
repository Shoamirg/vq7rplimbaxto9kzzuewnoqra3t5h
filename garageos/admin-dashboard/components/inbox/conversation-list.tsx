"use client";

import { Search } from "lucide-react";
import { cn } from "@garageos/design-system";

import type { InboxItem } from "@/lib/api/types";
import { CHANNEL_META, PRIORITY_STYLE, STATUS_STYLE, fmtTimer, relTime } from "./shared";

// Column 2 — the conversation list. Every row answers "why is this still open?"
// via the status line, and carries an AI summary chip so the queue reads smart.
export function ConversationList({
  items, activeId, onSelect, q, onQ, title, now, loadedAt,
}: {
  items: InboxItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  q: string;
  onQ: (v: string) => void;
  title: string;
  now: number;
  loadedAt: number;
}) {
  return (
    <div className="w-[380px] shrink-0 bg-card border-r border-border flex flex-col">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border shrink-0">
        <span className="text-sm font-bold text-foreground flex-1 truncate">{title}</span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Filter this queue…"
            className="flex-1 bg-transparent py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing here — inbox zero. 🎉</p>
        )}
        {items.map((c) => {
          const ch = c.last_channel ? CHANNEL_META[c.last_channel] : null;
          const active = activeId === c.id;
          const unread = (c.unread_messages ?? 0) + (c.unread_activity ?? 0);
          const slaLive = c.sla_elapsed_seconds != null
            ? c.sla_elapsed_seconds + Math.max(0, Math.floor((now - loadedAt) / 1000))
            : null;
          return (
            <button key={c.id} onClick={() => onSelect(c.id)}
              className={cn("w-full text-left px-4 py-3 border-b border-border/70 border-l-[3px] transition-colors relative",
                active ? "bg-primary/5 border-l-primary" : unread > 0 ? "border-l-primary/60 hover:bg-muted/40" : "border-l-transparent hover:bg-muted/40")}>
              <div className="flex items-center gap-2">
                <span className={cn("text-[13.5px] text-foreground truncate", unread > 0 ? "font-bold" : "font-semibold")}>
                  {c.customer_name ?? c.subject ?? "Conversation"}
                </span>
                <span className={cn("text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded", PRIORITY_STYLE[c.priority])}>
                  {c.priority === "high" ? "HIGH" : c.priority === "medium" ? "MED" : "LOW"}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{relTime(c.last_activity_at)}</span>
              </div>
              {c.subject && c.customer_name && (
                <p className="text-[12.5px] font-medium text-foreground/90 mt-1 truncate">{c.subject}</p>
              )}
              {c.vehicle_label && <p className="text-[11px] text-muted-foreground truncate">{c.vehicle_label}</p>}

              <div className="mt-1.5">
                <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded", STATUS_STYLE[c.status])}>
                  {c.status_label}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {ch && (
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded-full border", ch.cls)}>
                    {ch.icon} {ch.label}
                  </span>
                )}
                {c.ai_summary && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-px rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700">
                    ✦ {c.ai_summary}
                  </span>
                )}
                {slaLive != null && c.is_open && (
                  <span className={cn("ml-auto text-[11px] font-mono font-bold", c.sla_breached ? "text-red-600" : "text-amber-600")}>
                    {fmtTimer(slaLive)}
                  </span>
                )}
                {unread > 0 && (
                  <span className="ml-auto inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {unread}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
