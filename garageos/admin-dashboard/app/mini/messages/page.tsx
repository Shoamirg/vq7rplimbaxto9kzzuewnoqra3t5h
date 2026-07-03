"use client";

import { useState } from "react";
import { Bell, ChevronRight, MessageSquare } from "lucide-react";

import { useMiniData } from "@/lib/mini/hooks";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { MessagesResponse } from "@/lib/mini/types";
import { Card, EmptyState, ListSkeleton, ScreenError, ScreenHeader } from "@/components/mini/ui";

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

export default function MessagesPage() {
  const { data, loading, error, reload } = useMiniData<MessagesResponse>("/messages");
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState<"messages" | "activity">("messages");

  return (
    <div>
      <ScreenHeader title={t("mini.messages.title")} />

      <div className="mb-4 flex rounded-2xl bg-slate-100 p-1 text-sm font-semibold" role="tablist">
        {(["messages", "activity"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              haptic("selection");
              setTab(key);
            }}
            className={`flex-1 rounded-xl py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
            }`}
          >
            {t(`mini.messages.tab_${key}`)}
          </button>
        ))}
      </div>

      {error ? (
        <ScreenError onRetry={reload} />
      ) : loading || !data ? (
        <ListSkeleton />
      ) : tab === "messages" ? (
        data.conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-8" />}
            title={t("mini.messages.empty")}
            note={t("mini.messages.empty_hint")}
          />
        ) : (
          <div className="space-y-3">
            {data.conversations.map((c) => (
              <Card key={c.id} href={`/mini/messages/${c.id}`}>
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                    <MessageSquare className="size-6" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{c.subject ?? t("mini.home.conversation")}</p>
                      {c.awaiting_you ? <span className="size-2 shrink-0 rounded-full bg-blue-500" /> : null}
                    </div>
                    <p className="truncate text-sm text-slate-500">{c.preview ?? t("mini.home.open_thread")}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">{fmt.date(c.last_message_at, SHORT_DATE)}</span>
                    <ChevronRight className="size-4 text-slate-300" aria-hidden />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : data.activity.length === 0 ? (
        <EmptyState icon={<Bell className="size-8" />} title={t("mini.messages.activity_empty")} />
      ) : (
        <Card className="!p-2">
          <ul className="divide-y divide-slate-100">
            {data.activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-2 py-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
                  <Bell className="size-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{a.title}</p>
                  {a.detail ? <p className="text-sm text-slate-500">{a.detail}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-400">{fmt.date(a.date, SHORT_DATE)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
