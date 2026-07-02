"use client";

import Link from "next/link";
import { Bell, BellOff, PanelRightClose, Sparkles, UserCheck, Users } from "lucide-react";
import { cn } from "@garageos/design-system";

import { HealthGauge } from "@/components/vehicles/health-gauge";
import type { LinkedCard, ThreadDetail } from "@/lib/api/types";
import { roleColor } from "./shared";

const CARD_ICON: Record<LinkedCard["kind"], string> = {
  case: "🛰️", vehicle: "🚗", customer: "👤", passport: "🏅",
};

// Column 4 — collapsible context. Assigned / Following / Participants are kept
// visually distinct: responsibility vs. subscription vs. who has spoken.
export function ContextPanel({
  thread, onToggleFollow, onCollapse,
}: {
  thread: ThreadDetail;
  onToggleFollow: () => void;
  onCollapse: () => void;
}) {
  return (
    <aside className="w-[300px] shrink-0 bg-card border-l border-border overflow-y-auto">
      <div className="flex items-center px-4 h-12 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Context</span>
        <button onClick={onCollapse} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Collapse context">
          <PanelRightClose className="size-4" />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Responsibility vs subscription */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
              <UserCheck className="size-3" /> Assigned
            </p>
            <p className="text-[13px] font-semibold text-foreground truncate">
              {thread.assigned_name ?? <span className="text-muted-foreground font-normal">Unassigned</span>}
            </p>
          </div>
          <button onClick={onToggleFollow}
            className={cn("rounded-xl border p-2.5 text-left transition-colors",
              thread.is_following ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50")}>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
              {thread.is_following ? <Bell className="size-3" /> : <BellOff className="size-3" />} Following
            </p>
            <p className={cn("text-[13px] font-semibold", thread.is_following ? "text-primary" : "text-foreground")}>
              {thread.is_following ? "You + " + Math.max(0, thread.followers - 1) : "Follow"}
            </p>
          </button>
        </div>

        {/* Copilot — the single AI home */}
        {thread.ai_summary && (
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-white to-indigo-50/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 mb-2">
              <Sparkles className="size-3.5" /> Dispatcher Copilot
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Likely read</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{thread.ai_summary}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Full diagnostic copilot (issue confidence, next steps, one-click dispatch) arrives in M4.
            </p>
          </div>
        )}

        {/* Linked records */}
        {thread.linked.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Linked records</p>
            <div className="space-y-2">
              {thread.linked.map((c) => (
                <Link key={c.kind} href={c.link} target={c.kind === "passport" ? "_blank" : undefined}
                  className="flex items-center gap-2.5 rounded-xl border border-border p-2.5 hover:border-primary/40 hover:bg-muted/30 transition-colors">
                  {c.kind === "vehicle" && c.score != null && c.band ? (
                    <HealthGauge score={c.score} band={c.band} size={34} stroke={4} />
                  ) : (
                    <span className={cn("grid size-8 place-items-center rounded-lg text-sm shrink-0",
                      c.kind === "case" ? "bg-red-50" : c.kind === "customer" ? "bg-purple-50" : "bg-amber-50")}>
                      {CARD_ICON[c.kind]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground truncate">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.subtitle}</p>
                  </div>
                  <span className="text-muted-foreground text-sm">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Participants — who has actually spoken */}
        <div>
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
            <Users className="size-3" /> Participants
          </p>
          <div className="space-y-1.5">
            {thread.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[13px]">
                <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                  {p.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 truncate text-foreground">{p.display_name}</span>
                <span className={cn("text-[10px] capitalize", roleColor(p.role))}>{p.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
