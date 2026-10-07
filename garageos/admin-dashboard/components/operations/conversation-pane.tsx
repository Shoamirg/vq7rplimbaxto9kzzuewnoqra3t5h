"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Camera, Lock, Mic, Paperclip, Send } from "lucide-react";
import { cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { CaseDetail, ConvMessage, ThreadDetail } from "@/lib/api/types";

// Operations' communication IS a Unified Inbox conversation (linked by case_id).
// This pane renders that same live thread — proof the two surfaces share one
// model — with a jump into the full Inbox workspace.
function side(role: string): "them" | "me" | "mech" | "sys" {
  if (role === "dispatcher" || role === "manager") return "me";
  if (role === "mechanic") return "mech";
  if (role === "system") return "sys";
  return "them";
}

export function ConversationPane({ detail }: { detail: CaseDetail | null }) {
  const [convo, setConvo] = useState<ThreadDetail | null>(null);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const caseId = detail?.id ?? null;

  const load = useCallback(async () => {
    if (!caseId) return;
    try { setConvo(await clientFetch<ThreadDetail>(`/cases/${caseId}/conversation`)); } catch { /* keep */ }
  }, [caseId]);

  useEffect(() => { setConvo(null); load(); }, [load]);
  useEffect(() => {
    if (!caseId) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [caseId, load]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [convo?.messages.length]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || !convo) return;
    setText("");
    try {
      await clientFetch(`/conversations/${convo.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body, channel: convo.last_channel ?? "web", author_role: "dispatcher",
          kind: internal ? "note" : "text", is_internal: internal,
        }),
      });
      load();
    } catch { /* keep */ }
  }, [text, convo, internal, load]);

  if (!detail) {
    return <aside className="w-[400px] shrink-0 bg-card border-l border-border grid place-items-center text-sm text-muted-foreground">Select a case.</aside>;
  }

  const first = (detail.customer?.name ?? "customer").split(" ")[0];

  return (
    <aside className="w-[400px] shrink-0 bg-card border-l border-border flex flex-col">
      {/* Header — shared-model cue + jump to Inbox */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">Conversation</p>
          <p className="text-[11px] text-muted-foreground">One thread · any channel · shared with Inbox</p>
        </div>
        {convo && (
          <Link href={`/inbox?c=${convo.id}`}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline shrink-0">
            Open in Inbox <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>

      {/* Channel chip */}
      {convo?.last_channel && (
        <div className="px-3.5 py-1.5 border-b border-border">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200 capitalize">{convo.last_channel}</span>
        </div>
      )}

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-muted/20">
        {!convo && <p className="text-center text-xs text-muted-foreground pt-6">Loading conversation…</p>}
        {convo?.messages.map((m) => <Bubble key={m.id} m={m} />)}
        {convo && convo.messages.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground pt-6">No messages yet — say hello to {first}.</p>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="flex gap-1.5 mb-2">
          <button onClick={() => setInternal(false)}
            className={cn("text-[11px] font-semibold px-2 py-0.5 rounded", !internal ? "bg-primary/10 text-primary" : "text-muted-foreground")}>Reply</button>
          <button onClick={() => setInternal(true)}
            className={cn("text-[11px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1", internal ? "bg-amber-100 text-amber-700" : "text-muted-foreground")}>
            <Lock className="size-3" /> Internal note
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Paperclip className="size-4" /></button>
          <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Camera className="size-4" /></button>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder={internal ? `Internal note…` : `Message ${first}…`}
            className={cn("flex-1 rounded-lg px-3 py-2 text-sm outline-hidden border", internal ? "bg-amber-50/50 border-amber-200" : "bg-muted/50 border-transparent")} />
          <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Mic className="size-4" /></button>
          <button onClick={send} disabled={!text.trim()} className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-4" /></button>
        </div>
      </div>
    </aside>
  );
}

function Bubble({ m }: { m: ConvMessage }) {
  const s = side(m.author_role);
  if (s === "sys") {
    return <p className="text-center text-[11px] text-muted-foreground">{m.body}</p>;
  }
  if (m.is_internal && m.kind === "note") {
    return (
      <div className="mx-auto w-[92%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700 mb-0.5">🔒 Internal</p>
        <p className="text-[12.5px] text-amber-900">{m.body}</p>
      </div>
    );
  }
  return (
    <div className={cn("max-w-[85%]", s === "me" ? "ml-auto" : "")}>
      <p className={cn("text-[10px] font-semibold mb-1 px-1",
        s === "me" ? "text-primary text-right" : s === "mech" ? "text-emerald-600" : "text-slate-600")}>
        {m.author_name ?? m.author_role}
      </p>
      <div className={cn("px-3 py-2 rounded-xl text-[13px]",
        s === "me" ? "bg-primary text-primary-foreground rounded-br-sm"
          : s === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-bl-sm"
            : "bg-card border border-border rounded-bl-sm")}>
        {m.body}
        {m.attachments.map((a) => (
          <div key={a.id} className="mt-1 text-[11px] opacity-80">
            {a.kind === "photo" ? "📷" : a.kind === "location" ? "📍" : a.kind === "voice" ? "🎤" : "📄"} {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}
