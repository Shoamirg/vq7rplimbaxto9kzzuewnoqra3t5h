"use client";

import { forwardRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Camera, Check, MapPin, Megaphone, Mic, Moon, Paperclip, PanelRightOpen,
  Pin, Send, Siren, Smile, Sparkles,
} from "lucide-react";
import { cn } from "@garageos/design-system";

import type { ConvMessage, ThreadDetail } from "@/lib/api/types";
import { CHANNEL_META, CONV_TYPE_ICON, activityIcon, relTime, roleColor } from "./shared";

type ComposerTab = "reply" | "note" | "announcement";

const QUICK_ACTIONS = [
  "📞 Call", "🚗 Share ETA", "🏅 Share Passport", "📅 Book Appt",
  "🆘 Create Emergency", "🧾 Generate Estimate", "📷 Request Photos", "📍 Request Location",
];

// Column 3 — the conversation. Activity interleaves the event stream with
// messages; Messages is human replies only. One composer, three modes.
export const ThreadView = forwardRef<HTMLTextAreaElement, {
  thread: ThreadDetail;
  mode: "activity" | "messages";
  onMode: (m: "activity" | "messages") => void;
  composerTab: ComposerTab;
  onComposerTab: (t: ComposerTab) => void;
  onSend: (text: string, tab: ComposerTab) => void;
  onStatus: (s: string) => void;
  onToggleFollow: () => void;
  contextOpen: boolean;
  onOpenContext: () => void;
}>(function ThreadView(
  { thread, mode, onMode, composerTab, onComposerTab, onSend, onStatus, onToggleFollow, contextOpen, onOpenContext },
  composerRef,
) {
  const [text, setText] = useState("");
  const ch = thread.last_channel ? CHANNEL_META[thread.last_channel] : CHANNEL_META.web;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t, composerTab);
    setText("");
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-muted/20">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-800 text-white text-sm font-bold">
            {(thread.customer_name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground truncate">
              {thread.customer_name ?? thread.subject ?? "Conversation"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {[thread.vehicle_label, thread.case_code, thread.subject].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {thread.case_id && (
              <Link href={`/operations?case=${thread.case_id}`}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1">
                <Siren className="size-3.5" /> Open case <ArrowUpRight className="size-3" />
              </Link>
            )}
            <button onClick={onToggleFollow}
              className={cn("text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                thread.is_following ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-slate-600 hover:bg-muted")}>
              {thread.is_following ? "Following ✓" : "Follow"}
            </button>
            <button onClick={() => onStatus("snoozed")}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-amber-600 hover:bg-muted inline-flex items-center gap-1">
              <Moon className="size-3.5" /> Snooze
            </button>
            <button onClick={() => onStatus("resolved")}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1">
              <Check className="size-3.5" /> Resolve
            </button>
            {!contextOpen && (
              <button onClick={onOpenContext} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" aria-label="Open context">
                <PanelRightOpen className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Linked pills */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border">
            {CONV_TYPE_ICON[thread.conv_type]} <span className="capitalize">{thread.conv_type}</span>
          </span>
          {thread.linked.map((c) => (
            <Link key={c.kind} href={c.link} target={c.kind === "passport" ? "_blank" : undefined}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:text-primary transition-colors">
              {c.title}
            </Link>
          ))}
        </div>

        {/* Activity | Messages */}
        <div className="flex items-center gap-0 mt-2.5">
          {(["activity", "messages"] as const).map((m) => (
            <button key={m} onClick={() => onMode(m)}
              className={cn("text-[13px] font-semibold px-3 py-2 border-b-2 -mb-px capitalize transition-colors",
                mode === m ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {m}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground pb-1.5">
            Activity = every event + message · Messages = human replies
          </span>
        </div>
      </div>

      {/* Pinned */}
      {thread.pinned_notes.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 flex-wrap shrink-0">
          <Pin className="size-3.5 text-amber-600" />
          {thread.pinned_notes.map((p, i) => (
            <span key={i} className="text-[11.5px] font-medium text-amber-900 bg-white border border-amber-200 rounded-md px-2 py-0.5">{p}</span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mode === "messages"
          ? thread.messages.map((m) => <MessageBubble key={m.id} m={m} />)
          : thread.activity.map((a, i) => (
            a.type === "message"
              ? <MiniBubble key={i} role={a.author_role ?? "system"} name={a.title} body={a.detail} date={a.date} />
              : <EventLine key={i} icon={activityIcon(a)} title={a.title} detail={a.detail} date={a.date} />
          ))}
        {mode === "messages" && thread.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet.</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-1.5 px-4 py-2 bg-card border-t border-border overflow-x-auto shrink-0">
        {QUICK_ACTIONS.map((a) => (
          <span key={a} className={cn("text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap",
            a.includes("Emergency") ? "border-red-200 bg-red-50 text-red-600" : "border-border text-slate-600")}>
            {a}
          </span>
        ))}
      </div>

      {/* Suggested reply (single inline AI) */}
      {thread.ai_summary && composerTab === "reply" && (
        <div className="mx-4 mb-1 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 shrink-0">
          <Sparkles className="size-3.5 text-indigo-600 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 shrink-0">Suggested</span>
          <span className="text-[12.5px] text-slate-700 flex-1 truncate">
            A technician is on the way — you&apos;ll get an update shortly.
          </span>
          <button onClick={() => setText("A technician is on the way — you'll get an update shortly.")}
            className="text-[11px] font-bold text-white bg-indigo-600 rounded-md px-2.5 py-1 shrink-0">Insert</button>
        </div>
      )}

      {/* Composer */}
      <div className="bg-card border-t border-border p-3 shrink-0">
        <div className="flex gap-1.5 mb-2">
          {([["reply", "Reply"], ["note", "Internal note"], ["announcement", "Announcement"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => onComposerTab(k)}
              className={cn("text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors",
                composerTab === k
                  ? k === "note" ? "bg-amber-100 text-amber-700" : k === "announcement" ? "bg-purple-100 text-purple-700" : "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder={composerTab === "note" ? "Internal note — @mention a teammate…" : `Reply to ${thread.customer_name ?? "customer"}…`}
          className={cn("w-full resize-none rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-primary",
            composerTab === "note" ? "border-amber-200 bg-amber-50/40" : "border-border bg-background")}
        />
        <div className="flex items-center gap-1.5 mt-2">
          {[Camera, MapPin, Mic, Paperclip, Smile].map((Icon, i) => (
            <button key={i} className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
              <Icon className="size-4" />
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {composerTab === "note" ? "🔒 Internal" : `Sending via ${ch.icon} ${ch.label}`}
          </span>
          <button onClick={send} disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-[13px] font-bold px-4 py-2 rounded-lg disabled:opacity-40">
            {composerTab === "announcement" ? <Megaphone className="size-4" /> : <Send className="size-4" />} Send
          </button>
        </div>
      </div>
    </div>
  );
});

// ── message rendering ──
function bubbleSide(role: string): "them" | "me" | "mech" {
  if (role === "dispatcher" || role === "manager") return "me";
  if (role === "mechanic") return "mech";
  return "them";
}

function MessageBubble({ m }: { m: ConvMessage }) {
  const side = bubbleSide(m.author_role);
  if (m.is_internal && m.kind === "note") {
    return (
      <div className="mx-auto w-[88%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">🔒 Internal note</p>
        <p className="text-[13px] text-amber-900 whitespace-pre-wrap">{renderMentions(m.body)}</p>
      </div>
    );
  }
  return (
    <div className={cn("max-w-[74%]", side === "me" ? "ml-auto" : "")}>
      <p className={cn("text-[10px] font-bold mb-1 px-1", side === "me" ? "text-primary text-right" : roleColor(m.author_role))}>
        {m.author_name ?? m.author_role}
      </p>
      {m.body && (
        <div className={cn("px-3 py-2 rounded-2xl text-[13px] leading-relaxed",
          side === "me" ? "bg-primary text-primary-foreground rounded-br-sm"
            : side === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-bl-sm"
              : "bg-card border border-border rounded-bl-sm")}>
          {m.body}
        </div>
      )}
      {m.attachments.map((a) => (
        <div key={a.id} className={cn("mt-1 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px]", side === "me" && "ml-auto")}>
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-sm">
            {a.kind === "photo" ? "📷" : a.kind === "location" ? "📍" : a.kind === "voice" ? "🎤" : "📄"}
          </span>
          <span className="font-medium text-foreground">{a.label}</span>
        </div>
      ))}
      <p className={cn("text-[10px] text-muted-foreground mt-1 px-1", side === "me" && "text-right")}>{relTime(m.created_at)}</p>
    </div>
  );
}

function MiniBubble({ role, name, body, date }: { role: string; name: string; body: string | null; date: string | null }) {
  const side = bubbleSide(role);
  return (
    <div className={cn("max-w-[70%]", side === "me" ? "ml-auto" : "")}>
      <span className={cn("text-[10px] font-bold px-1", side === "me" ? "text-primary" : roleColor(role))}>{name}</span>
      <div className={cn("px-3 py-1.5 rounded-xl text-[12.5px]",
        side === "me" ? "bg-primary text-primary-foreground" : side === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-card border border-border")}>
        {body ?? "—"}
      </div>
    </div>
  );
}

function EventLine({ icon, title, detail, date }: { icon: string; title: string; detail: string | null; date: string | null }) {
  return (
    <div className="flex items-center gap-2 justify-center text-[11.5px] text-muted-foreground">
      <span className="text-sm">{icon}</span>
      <span className="font-medium text-slate-600">{title}</span>
      {detail && <span>· {detail}</span>}
      <span className="text-muted-foreground/70">· {relTime(date)}</span>
    </div>
  );
}

function renderMentions(body: string | null) {
  if (!body) return null;
  return body.split(/(@\w+)/g).map((part, i) =>
    part.startsWith("@")
      ? <span key={i} className="font-bold text-purple-600 bg-purple-100 rounded px-1">{part}</span>
      : <span key={i}>{part}</span>);
}
