"use client";

import { cn } from "@garageos/design-system";

import type { Channel, InboxCounts } from "@/lib/api/types";
import { CHANNEL_FILTERS, TYPE_FILTERS, VIEWS } from "./shared";

// Column 1 — work queues first ("what needs a human"), then type + channel as
// filters. This is the home of work, not a list of chat folders.
export function QueueRail({
  view, onView, channel, onChannel, type, onType, counts,
}: {
  view: string;
  onView: (v: string) => void;
  channel: Channel | null;
  onChannel: (c: Channel | null) => void;
  type: string;
  onType: (t: string) => void;
  counts: InboxCounts | null;
}) {
  return (
    <nav className="w-56 shrink-0 bg-slate-900 text-slate-300 flex flex-col overflow-y-auto">
      <Section label="Work queues" />
      {VIEWS.map((v) => {
        const n = v.count && counts ? counts[v.count] : undefined;
        const active = view === v.key;
        const alert = v.key === "needs_reply" || v.key === "sla_breached";
        return (
          <button key={v.key} onClick={() => onView(v.key)}
            className={cn("flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors",
              active ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-slate-800")}>
            <span className="w-4 text-center text-[13px]">{v.icon}</span>
            <span className="flex-1 text-left truncate">{v.label}</span>
            {n ? (
              <span className={cn("min-w-[20px] text-center text-[11px] font-bold rounded-full px-1.5 py-px",
                active ? "bg-blue-600 text-white" : alert && n > 0 ? "bg-red-600 text-white" : "bg-slate-950 text-slate-400")}>
                {n}
              </span>
            ) : null}
          </button>
        );
      })}

      <Section label="Type" />
      <div className="flex flex-wrap gap-1 px-3 pb-1">
        {TYPE_FILTERS.map((t) => (
          <button key={t.key} onClick={() => onType(t.key)}
            className={cn("px-2 py-0.5 rounded-full text-[11px] transition-colors",
              type === t.key ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>

      <Section label="Channels · filters" />
      {CHANNEL_FILTERS.map((c) => (
        <button key={c.key} onClick={() => onChannel(channel === c.key ? null : c.key)}
          className={cn("flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors",
            channel === c.key ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-slate-800")}>
          <span className="w-4 text-center">{c.icon}</span>
          <span className="flex-1 text-left">{c.label}</span>
        </button>
      ))}
      <div className="h-4" />
    </nav>
  );
}

function Section({ label }: { label: string }) {
  return (
    <p className="px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
  );
}
