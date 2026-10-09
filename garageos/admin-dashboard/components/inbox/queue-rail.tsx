"use client";

import { cn } from "@garageos/design-system";

import type { Channel, InboxCounts } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
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
  const { t, fmt } = useI18n();
  return (
    <nav aria-label={t("inbox.queue_navigation")} className="w-56 min-h-0 flex-1 bg-slate-900 text-slate-300 flex flex-col overflow-y-auto">
      <Section label={t("inbox.work_queues")} />
      <p className="px-4 pb-2 text-xs text-slate-300">{t("inbox.count_scope")}</p>
      {VIEWS.map((v) => {
        const n = v.count && counts ? counts[v.count] : undefined;
        const active = view === v.key;
        const alert = v.key === "needs_reply" || v.key === "sla_breached";
        return (
          <button key={v.key} onClick={() => onView(v.key)} aria-current={active ? "page" : undefined}
            className={cn("min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-primary flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors",
              active ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-slate-800")}>
            <span className="w-4 text-center text-[13px]">{v.icon}</span>
            <span className="flex-1 text-left break-words">{t(v.label)}</span>
            {n !== undefined ? (
              <span className={cn("min-w-[20px] text-center text-[11px] font-bold rounded-full px-1.5 py-px",
                active ? "bg-blue-600 text-white" : alert && n > 0 ? "bg-red-600 text-white" : "bg-slate-950 text-slate-400")}>
                {fmt.number(n)}
              </span>
            ) : null}
          </button>
        );
      })}

      <Section label={t("inbox.type_filter")} />
      <div className="flex flex-wrap gap-1 px-3 pb-1">
        {TYPE_FILTERS.map((item) => (
          <button key={item.key} onClick={() => onType(item.key)} aria-pressed={type === item.key}
            className={cn("min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-primary px-2 py-0.5 rounded-full text-[11px] transition-colors",
              type === item.key ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:text-white")}>
            {t(`inbox.type.${item.key}`)}
          </button>
        ))}
      </div>

      <Section label={t("inbox.channel_filter")} />
      {CHANNEL_FILTERS.map((c) => (
        <button key={c.key} onClick={() => onChannel(channel === c.key ? null : c.key)} aria-pressed={channel === c.key}
          className={cn("min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-primary flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors",
            channel === c.key ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-slate-800")}>
          <span className="w-4 text-center">{c.icon}</span>
          <span className="flex-1 text-left">{t(`inbox.channel.${c.key}`)}</span>
        </button>
      ))}
      <div className="h-4" />
    </nav>
  );
}

function Section({ label }: { label: string }) {
  return (
    <p className="px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">{label}</p>
  );
}
