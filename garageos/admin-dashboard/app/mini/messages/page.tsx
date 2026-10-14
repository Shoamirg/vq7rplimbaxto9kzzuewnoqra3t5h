"use client";

import { Headphones, MessageSquare } from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { useI18n } from "@/lib/i18n/context";
import { haptic } from "@/lib/mini/telegram";
import type { MessagesResponse } from "@/lib/mini/types";
import Link from "next/link";
import { EmptyState, ListSkeleton, ScreenError, ScreenHeader } from "@/components/mini/ui";

// A clean DM inbox — Telegram/Instagram style: full-width rows, an avatar, the
// last message preview, a timestamp, and an unread dot. No tabs, no cards.
export default function MessagesPage() {
  const { data, loading, error, reload } = useMiniData<MessagesResponse>("/messages");
  const { t, fmt } = useI18n();

  return (
    <div>
      <ScreenHeader title={t("mini.messages.title")} />

      {error ? (
        <ScreenError onRetry={reload} />
      ) : loading || !data ? (
        <ListSkeleton />
      ) : data.conversations.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-8" />}
          title={t("mini.messages.empty")}
          note={t("mini.messages.empty_hint")}
        />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/4">
          <ul>
            {data.conversations.map((c, i) => (
              <li key={c.id} className={i > 0 ? "border-t border-slate-100" : ""}>
                <Link
                  href={`/mini/messages/${c.id}`}
                  onClick={() => haptic("light")}
                  className="flex items-center gap-3 px-4 py-3.5 transition active:bg-slate-50 focus-visible:outline-hidden focus-visible:bg-slate-50"
                >
                  <div className="grid size-12 shrink-0 place-items-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-white">
                    <Headphones className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate ${c.awaiting_you ? "font-bold" : "font-semibold"} text-slate-900`}>
                        {c.subject ?? t("mini.home.conversation")}
                      </p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {fmt.date(c.last_message_at, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`truncate text-sm ${c.awaiting_you ? "text-slate-600" : "text-slate-400"}`}>
                        {c.preview ?? t("mini.home.open_thread")}
                      </p>
                      {c.awaiting_you ? (
                        <span className="ml-auto size-2.5 shrink-0 rounded-full bg-blue-500" aria-label="unread" />
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
