"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageIcon, Send } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import type { ThreadMessage, ThreadResponse } from "@/lib/mini/types";
import { ListSkeleton } from "@/components/mini/ui";

function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!params?.id) return;
    miniFetch<ThreadResponse>(`/messages/${params.id}`).then(setThread).catch(() => setThread(null));
  }, [params?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !params?.id || sending) return;
    setSending(true);
    setDraft("");
    try {
      const msg = await miniFetch<ThreadMessage>(`/messages/${params.id}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      haptic("light");
      setThread((t) => (t ? { ...t, messages: [...t.messages, msg] } : t));
    } catch {
      haptic("error");
      setDraft(body); // restore on failure
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <Link href="/mini/messages" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500">
        <ArrowLeft className="size-4" /> Messages
      </Link>

      {!thread ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <h1 className="mb-3 px-1 text-lg font-bold text-slate-900">{thread.subject ?? "Conversation"}</h1>
          <div className="flex-1 space-y-2.5">
            {thread.messages.map((m) => (
              <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.from_me
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-900/[0.05]"
                  }`}
                >
                  {!m.from_me && m.author_name ? (
                    <p className="mb-0.5 text-xs font-semibold text-slate-400">{m.author_name}</p>
                  ) : null}
                  {m.attachments.map((a) => (
                    <div key={a.id} className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
                      <ImageIcon className="size-3.5" /> {a.label}
                    </div>
                  ))}
                  {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                  <p className={`mt-1 text-[10px] ${m.from_me ? "text-white/60" : "text-slate-400"}`}>
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="sticky bottom-24 mt-3 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-slate-900/[0.06]">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message…"
              aria-label="Type a message"
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
