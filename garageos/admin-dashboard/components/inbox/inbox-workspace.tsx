"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox as InboxIcon } from "lucide-react";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Channel, InboxCounts, InboxItem, InboxResponse, ThreadDetail } from "@/lib/api/types";
import { ConversationList } from "./conversation-list";
import { ContextPanel } from "./context-panel";
import { QueueRail } from "./queue-rail";
import { ThreadView } from "./thread-view";

type ComposerTab = "reply" | "note" | "announcement";

// The Unified Inbox — one client-side workspace. Queues ↔ list ↔ thread swap
// via state, never a navigation, so switching is instant. Keyboard-first.
export function InboxWorkspace() {
  const { t } = useI18n();
  const [view, setView] = useState("needs_reply");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);

  const [contextOpen, setContextOpen] = useState(true);
  const [mode, setMode] = useState<"activity" | "messages">("activity");
  const [composerTab, setComposerTab] = useState<ComposerTab>("reply");
  const [now, setNow] = useState(() => Date.now());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Deep-link from Operations ("Open in Inbox") preselects the conversation.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setActiveId(c);
  }, [searchParams]);

  const loadInbox = useCallback(async () => {
    const qs = new URLSearchParams({ view });
    if (channel) qs.set("channel", channel);
    if (type !== "all") qs.set("type", type);
    try {
      const data = await clientFetch<InboxResponse>(`/conversations?${qs.toString()}`);
      setItems(data.items);
      setCounts(data.counts);
      setLoadedAt(Date.now());
      // Only auto-select when nothing is chosen — never override an explicit
      // selection (e.g. a deep-link ?c=… from Operations), even if it's not in
      // the current queue. The thread loads by id independently.
      setActiveId((cur) => cur ?? data.items[0]?.id ?? null);
    } catch { /* keep last */ }
  }, [view, channel, type]);

  const loadThread = useCallback(async (id: string) => {
    try { setThread(await clientFetch<ThreadDetail>(`/conversations/${id}`)); } catch { /* keep */ }
  }, []);

  // Selecting a thread clears its unread and refreshes counts.
  const selectThread = useCallback((id: string) => {
    setActiveId(id);
    clientFetch(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ mark_read: true }) })
      .then(() => loadInbox()).catch(() => {});
  }, [loadInbox]);

  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { const t = setInterval(loadInbox, 8000); return () => clearInterval(t); }, [loadInbox]);
  useEffect(() => { if (activeId) loadThread(activeId); }, [activeId, loadThread]);
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => loadThread(activeId), 8000);
    return () => clearInterval(t);
  }, [activeId, loadThread]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) =>
      (c.customer_name ?? "").toLowerCase().includes(s) ||
      (c.subject ?? "").toLowerCase().includes(s) ||
      (c.vehicle_label ?? "").toLowerCase().includes(s));
  }, [q, items]);

  const mutateStatus = useCallback(async (status: string) => {
    if (!activeId) return;
    try {
      await clientFetch(`/conversations/${activeId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await Promise.all([loadThread(activeId), loadInbox()]);
    } catch { /* keep */ }
  }, [activeId, loadThread, loadInbox]);

  const toggleFollow = useCallback(async () => {
    if (!activeId || !thread) return;
    try {
      await clientFetch(`/conversations/${activeId}/follow`, { method: thread.is_following ? "DELETE" : "POST" });
      await loadThread(activeId);
    } catch { /* keep */ }
  }, [activeId, thread, loadThread]);

  const send = useCallback(async (textVal: string, tab: ComposerTab) => {
    if (!activeId) return;
    const body = {
      body: textVal,
      channel: thread?.last_channel ?? "web",
      author_role: "dispatcher",
      kind: tab === "note" ? "note" : tab === "announcement" ? "announcement" : "text",
      is_internal: tab === "note",
    };
    try {
      await clientFetch(`/conversations/${activeId}/messages`, { method: "POST", body: JSON.stringify(body) });
      await Promise.all([loadThread(activeId), loadInbox()]);
    } catch { /* keep */ }
  }, [activeId, thread, loadThread, loadInbox]);

  // ── Keyboard-first navigation ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (e.key === "Escape") { setQ(""); (el as HTMLElement)?.blur?.(); return; }
      if (typing) return; // don't hijack while composing
      const idx = filtered.findIndex((c) => c.id === activeId);
      switch (e.key) {
        case "j": if (filtered.length) { e.preventDefault(); selectThread(filtered[Math.min(filtered.length - 1, idx + 1)]?.id); } break;
        case "k": if (filtered.length) { e.preventDefault(); selectThread(filtered[Math.max(0, idx - 1)]?.id); } break;
        case "r": if (thread) { e.preventDefault(); setComposerTab("reply"); composerRef.current?.focus(); } break;
        case "i": if (thread) { e.preventDefault(); setComposerTab("note"); composerRef.current?.focus(); } break;
        case "f": if (thread) { e.preventDefault(); toggleFollow(); } break;
        case "[": setContextOpen(false); break;
        case "]": setContextOpen(true); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeId, thread, selectThread, toggleFollow]);

  const viewLabel = t(`inbox.view.${view}`);

  return (
    <div className="flex h-full overflow-hidden">
      <QueueRail
        view={view} onView={(v) => { setView(v); setActiveId(null); }}
        channel={channel} onChannel={setChannel}
        type={type} onType={setType} counts={counts}
      />
      <ConversationList
        items={filtered} activeId={activeId} onSelect={selectThread}
        q={q} onQ={setQ} title={viewLabel} now={now} loadedAt={loadedAt}
      />
      {thread ? (
        <ThreadView
          ref={composerRef}
          thread={thread}
          mode={mode} onMode={setMode}
          composerTab={composerTab} onComposerTab={setComposerTab}
          onSend={send} onStatus={mutateStatus} onToggleFollow={toggleFollow}
          contextOpen={contextOpen} onOpenContext={() => setContextOpen(true)}
        />
      ) : (
        <div className="flex-1 grid place-items-center text-muted-foreground">
          <div className="text-center">
            <InboxIcon className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("inbox.empty_title")}</p>
            <p className="text-xs mt-1 text-muted-foreground/70">{t("inbox.empty_hint")}</p>
          </div>
        </div>
      )}
      {thread && contextOpen && (
        <ContextPanel thread={thread} onToggleFollow={toggleFollow} onCollapse={() => setContextOpen(false)} />
      )}
    </div>
  );
}
