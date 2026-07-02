"use client";

import { useState } from "react";
import { Send, Paperclip, Camera, Mic, Lock } from "lucide-react";
import { cn } from "@garageos/design-system";

import type { CaseDetail } from "@/lib/api/types";

const TABS = ["Conversation", "Internal", "Files"] as const;

// M2: layout + structure only. The message model + realtime engine land in M3;
// this establishes the channel-agnostic, multi-participant shape.
export function ConversationPane({ detail }: { detail: CaseDetail | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Conversation");
  const name = detail?.customer?.name ?? "customer";
  const first = name.split(" ")[0];

  return (
    <aside className="w-[400px] shrink-0 bg-card border-l border-border flex flex-col">
      <div className="flex gap-1 px-3 pt-3 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Conversation" && (
        <>
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border flex-wrap">
            {detail?.channel && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200 capitalize">{detail.channel}</span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto">one thread · any channel</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-muted/20">
            <Msg who={`${first} · Customer`} side="them">Help — my car needs assistance. 😟</Msg>
            <Msg who="You · Dispatcher" side="me">We&apos;ve got you. A technician is being assigned now — hang tight.</Msg>
            {detail?.assigned_mechanic && (
              <Msg who={`${detail.assigned_mechanic.split(" ")[0]} · Mechanic`} side="mech">On my way — see you shortly.</Msg>
            )}
            <p className="text-center text-[11px] text-muted-foreground pt-2">Live messaging arrives in M3 · this is the thread structure.</p>
          </div>
          <div className="border-t border-border p-3 flex items-center gap-2">
            <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Paperclip className="size-4" /></button>
            <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Camera className="size-4" /></button>
            <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Message {first}…</div>
            <button className="grid size-8 place-items-center rounded-lg text-muted-foreground"><Mic className="size-4" /></button>
            <button className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Send className="size-4" /></button>
          </div>
        </>
      )}

      {tab === "Internal" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Lock className="size-3.5" /> Internal — not visible to the customer.
          </div>
          <Msg who="Dispatcher" side="me">Customer is Platinum — keep them updated closely.</Msg>
          <p className="text-center text-[11px] text-muted-foreground pt-2">Staff notes arrive in M3.</p>
        </div>
      )}

      {tab === "Files" && (
        <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
          Photos, documents &amp; voice notes attach here (M3).
        </div>
      )}
    </aside>
  );
}

function Msg({ who, side, children }: { who: string; side: "them" | "me" | "mech"; children: React.ReactNode }) {
  return (
    <div className={cn("max-w-[85%]", side === "me" ? "ml-auto" : "")}>
      <p className={cn("text-[10px] font-semibold mb-1 px-1",
        side === "me" ? "text-primary text-right" : side === "mech" ? "text-emerald-600" : "text-slate-600")}>{who}</p>
      <div className={cn("px-3 py-2 rounded-xl text-sm",
        side === "me" ? "bg-primary text-primary-foreground rounded-br-sm"
          : side === "mech" ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-bl-sm"
            : "bg-card border border-border rounded-bl-sm")}>{children}</div>
    </div>
  );
}
