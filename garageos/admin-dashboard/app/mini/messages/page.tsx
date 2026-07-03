"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronRight, MessageSquare } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { MessagesResponse } from "@/lib/mini/types";
import { Card, EmptyState, Loading, ScreenHeader } from "@/components/mini/ui";

function fmtWhen(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const [data, setData] = useState<MessagesResponse | null>(null);
  const [tab, setTab] = useState<"messages" | "activity">("messages");

  useEffect(() => {
    miniFetch<MessagesResponse>("/messages").then(setData).catch(() => setData({ conversations: [], activity: [] }));
  }, []);

  return (
    <div>
      <ScreenHeader title="Messages" />

      <div className="mb-4 flex rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
        {(["messages", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 capitalize transition ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!data ? (
        <Loading />
      ) : tab === "messages" ? (
        data.conversations.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-8" />} title="No messages yet" note="Your garage will reach you here." />
        ) : (
          <div className="space-y-3">
            {data.conversations.map((c) => (
              <Card key={c.id} href={`/mini/messages/${c.id}`}>
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                    <MessageSquare className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{c.subject ?? "Conversation"}</p>
                      {c.awaiting_you ? <span className="size-2 shrink-0 rounded-full bg-blue-500" /> : null}
                    </div>
                    <p className="truncate text-sm text-slate-500">{c.preview ?? "Open thread"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">{fmtWhen(c.last_message_at)}</span>
                    <ChevronRight className="size-4 text-slate-300" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : data.activity.length === 0 ? (
        <EmptyState icon={<Bell className="size-8" />} title="No activity yet" />
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
                  <p className="mt-0.5 text-xs text-slate-400">{fmtWhen(a.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
