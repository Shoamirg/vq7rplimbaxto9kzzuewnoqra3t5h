"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { Channel, ConvMessage, InboxResponse, ThreadDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import type { MessageMode } from "@/lib/message-intents";
import { MessageStorageError } from "@/lib/message-intents";
import { useMessageComposer } from "@/lib/use-message-composer";
import { useStaffMessageSession, verifyStaffMessageActor } from "@/lib/use-staff-message-session";
import { useOperationRead, accessFailure } from "../operations/use-operation-read";
import { ConversationList } from "./conversation-list";
import { ContextPanel } from "./context-panel";
import { QueueRail } from "./queue-rail";
import { ThreadView } from "./thread-view";
import { VIEWS } from "./shared";

const control = "min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function InboxWorkspace() {
  const { t } = useI18n(), session = useStaffMessageSession();
  const [view, setView] = useState("needs_reply"), [channel, setChannel] = useState<Channel | null>(null);
  const [type, setType] = useState("all"), [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null), [selection, setSelection] = useState(0);
  const [denied, setDenied] = useState(false), deniedRef = useRef(false);
  const mounted = useRef(true), composerRef = useRef<HTMLTextAreaElement>(null);
  const verification = useRef(0);
  const [contextOpen, setContextOpen] = useState(false), [listOpen, setListOpen] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [mode, setMode] = useState<"activity" | "messages">("messages");
  const [modes, setModes] = useState<Record<string, MessageMode>>({});
  const [now, setNow] = useState(() => Date.now()), [loadedAt, setLoadedAt] = useState(() => Date.now());
  const params = useSearchParams(), linkedId = params.get("c");
  const actor = denied ? null : session.actor;
  const principal = actor ? `${actor.center}:${actor.id}` : null;
  // Object identity also distinguishes a newly verified session for the same
  // principal. A denial from its previous cookie cannot revoke the new session.
  const currentActor = useRef(actor); currentActor.current = actor;
  const authorized = () => !deniedRef.current && session.isAuthorized();
  const onDenied = (_error: unknown) => {
    session.suspend(); deniedRef.current = true; setDenied(true);
    setContextOpen(false);
  };
  const selectThread = useCallback((id: string | null) => {
    setSelection(old => old + 1); setActiveId(id); setListOpen(false); setContextOpen(false);
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (linkedId) selectThread(linkedId); }, [linkedId, selectThread]);

  const qs = new URLSearchParams({ view });
  if (channel) qs.set("channel", channel);
  if (type !== "all") qs.set("type", type);
  const list = useOperationRead<InboxResponse>(principal ? `${principal}:${qs}` : null,
    `/conversations?${qs}`, !!actor && authorized(), onDenied);
  useEffect(() => {
    if (!list.data) return;
    setLoadedAt(Date.now());
    if (!activeId && !linkedId && list.data.items[0]) selectThread(list.data.items[0].id);
  }, [list.data, activeId, linkedId, selectThread]);
  const readKey = principal && activeId ? `${principal}:${activeId}:${selection}` : null;
  const [pausedRead, setPausedRead] = useState<string | null>(null);
  const read = useOperationRead<ThreadDetail>(readKey, activeId ? `/conversations/${activeId}` : null,
    !!actor && authorized() && pausedRead !== readKey, onDenied);
  // A failed authorization/ownership read never exposes a saved receipt. A
  // non-auth refresh failure retains the already validated thread and its ACK.
  const thread = read.data?.id === activeId && !(read.error instanceof ClientApiError && read.error.status === 404) ? read.data : null;
  const markedRead = useRef<string | null>(null);
  useEffect(() => {
    if (!thread || !actor || !authorized() || !session.canWrite || markedRead.current === readKey) return;
    markedRead.current = readKey;
    const capturedActor = actor, epoch = verification.current;
    void clientFetch(`/conversations/${thread.id}`, { method: "PATCH", body: JSON.stringify({ mark_read: true }) })
      .then(() => { if (mounted.current && epoch === verification.current && currentActor.current === capturedActor && authorized()) void list.refresh(); })
      .catch(error => { if (mounted.current && epoch === verification.current && currentActor.current === capturedActor && accessFailure(error)) onDenied(error); });
  });
  const composerTab = activeId ? modes[activeId] ?? "reply" : "reply";
  const [acknowledged, setAcknowledged] = useState<Record<string, ConvMessage[]>>({});
  const composer = useMessageComposer<ConvMessage>({
    actor, conversation: thread?.id ?? null, mode: composerTab, ready: !!thread,
    canSubmit: session.canWrite && !read.loading && !read.error, isAuthorized: authorized,
    readIdentity: readKey ?? undefined,
    request: async intent => {
      setPausedRead(readKey); read.invalidate();
      try {
        const fresh = await verifyStaffMessageActor(() => mounted.current && authorized(), intent.actor);
        if (!fresh.canWrite) throw new ClientApiError("Message write access unavailable", 403);
        return await clientFetch<ConvMessage>(`/conversations/${intent.conversation}/messages`, {
          method: "POST", headers: { "Idempotency-Key": intent.key }, body: JSON.stringify(intent.payload),
        });
      } finally { setPausedRead(null); }
    },
    onAcknowledged: (message, intent) => {
      if (thread?.id !== intent.conversation || !authorized()) return;
      read.invalidate();
      setAcknowledged(old => ({ ...old, [`${principal}:${intent.conversation}`]: [...(old[`${principal}:${intent.conversation}`] ?? []).filter(row => row.id !== message.id), message] }));
      void list.refresh(); // Its failure cannot turn an acknowledged POST into an unsent draft.
    }, onDenied,
  });
  useEffect(() => {
    if (activeId && composer.intent && modes[activeId] === undefined) setModes(old => ({ ...old, [activeId]: composer.intent!.mode }));
  }, [activeId, composer.intent, modes]);
  const onComposerTab = (value: MessageMode) => { if (activeId) setModes(old => ({ ...old, [activeId]: value })); };
  const send = () => {
    if (!thread) return;
    const channel = thread.last_channel && thread.last_channel !== "internal" ? thread.last_channel
      : [...thread.messages].reverse().find(row => !row.is_internal && row.channel !== "internal")?.channel ?? "web";
    composer.send({ body: composer.text, channel, author_role: "dispatcher",
      kind: composerTab === "note" ? "note" : composerTab === "announcement" ? "announcement" : "text", is_internal: composerTab === "note" });
  };
  const visibleThread = thread ? { ...thread, messages: [...thread.messages,
    ...(acknowledged[`${principal}:${thread.id}`] ?? []).filter(row => !thread.messages.some(saved => saved.id === row.id))] } : null;
  const filtered = useMemo(() => {
    const value = q.trim().toLowerCase(), rows = list.data?.items ?? [];
    return value ? rows.filter(row => [row.customer_name, row.subject, row.vehicle_label].some(text => text?.toLowerCase().includes(value))) : rows;
  }, [q, list.data]);
  // Existing status/follow actions keep their scope. Completions refresh the
  // current read through its identity guard; they cannot restore an old thread.
  const mutate = async (path: string, init: RequestInit) => {
    if (!actor || !thread || !authorized() || !session.canWrite) return;
    const capturedActor = actor, epoch = verification.current;
    try {
      await clientFetch(path, init);
      if (mounted.current && epoch === verification.current && currentActor.current === capturedActor && authorized()) { void read.refresh(); void list.refresh(); }
    } catch (error) {
      if (mounted.current && epoch === verification.current && currentActor.current === capturedActor && accessFailure(error)) onDenied(error);
    }
  };
  const toggleFollow = () => { if (thread) void mutate(`/conversations/${thread.id}/follow`, { method: thread.is_following ? "DELETE" : "POST" }); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.matches("input,textarea,select,[contenteditable=true]")) return;
      const index = filtered.findIndex(row => row.id === activeId);
      if (event.key === "j" || event.key === "k") {
        const row = filtered[Math.max(0, Math.min(filtered.length - 1, index + (event.key === "j" ? 1 : -1)))];
        if (row) { event.preventDefault(); selectThread(row.id); }
      }
      if (thread && ["r", "i"].includes(event.key)) { event.preventDefault(); onComposerTab(event.key === "i" ? "note" : "reply"); composerRef.current?.focus(); }
      if (thread && event.key === "f") { event.preventDefault(); toggleFollow(); }
      if (event.key === "[") setContextOpen(false);
      if (event.key === "]") setContextOpen(true);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  const verify = async () => {
    verification.current++;
    const fresh = await session.verify();
    if (fresh && mounted.current) { deniedRef.current = false; setDenied(false); }
  };
  if (!actor) return <div className="space-y-3 p-4 text-sm">
    <p role={denied || session.error ? "alert" : "status"}>{t(session.error instanceof MessageStorageError ? "message.storage" : denied || session.error instanceof ClientApiError && [401, 403].includes(session.error.status) ? "message.auth" : session.error ? "message.verify_error" : "ops.loading")}</p>
    {(denied || !!session.error) && <button className={control} onClick={() => void verify()}>{t("message.verify")}</button>}
  </div>;
  return <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
    <div className="flex flex-wrap gap-2 border-b border-border p-2 2xl:hidden"><button className={control} aria-expanded={queuesOpen} onClick={() => setQueuesOpen(old => !old)}>{t("message.queues")}</button></div>
    {!!list.error && <div role="alert" className="space-y-2 p-3 text-sm"><p>{t(composer.saved ? "message.refresh_error" : "ops.read_error")}</p><button className={control} onClick={() => void list.refresh()}>{t("ops.retry")}</button></div>}
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <div className={cn("min-h-0 flex-col bg-card 2xl:static 2xl:flex", queuesOpen ? "absolute inset-y-0 left-0 z-30 flex max-w-full shadow-xl" : "hidden")}>
      <button className={cn(control, "2xl:hidden")} onClick={() => setQueuesOpen(false)}>{t("message.close_queues")}</button>
      <QueueRail view={view} onView={setView} channel={channel} onChannel={setChannel} type={type} onType={setType} counts={list.data?.counts ?? null} />
    </div>
    <div className={cn("min-h-0 min-w-0 flex-col border-r border-border lg:flex lg:w-[300px] lg:shrink-0", !activeId || listOpen ? "flex w-full" : "hidden")}>
      <ConversationList items={filtered} activeId={activeId} onSelect={selectThread} q={q} onQ={setQ} title={VIEWS.find(v => v.key === view)?.label ?? t("nav.inbox")} now={now} loadedAt={loadedAt} loading={list.loading} verified={!!list.data} failed={!!list.error} />
    </div>
    <section aria-label={t("nav.inbox")} className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", activeId && !listOpen ? "flex" : "hidden")}>
      <div className="flex flex-wrap gap-2 border-b border-border p-2">
        <button className={cn(control, "lg:hidden")} onClick={() => setListOpen(true)}>{t("message.conversations")}</button>
        <button className={control} disabled={composer.pending && pausedRead === readKey || read.loading} onClick={() => void read.refresh()}>{t("message.refresh")}</button>
      </div>
      {!!read.error && <div role="alert" className="space-y-2 p-3 text-sm"><p>{t(composer.saved ? "message.refresh_error" : "message.read_error")}</p><button className={control} onClick={() => void read.refresh()}>{t("ops.retry")}</button></div>}
      {visibleThread ? <ThreadView ref={composerRef} thread={visibleThread} mode={mode} onMode={setMode} composerTab={composerTab} onComposerTab={onComposerTab}
        composer={composer} canWrite={session.canWrite} loading={read.loading} readError={!!read.error} onSend={send}
        onStatus={status => void mutate(`/conversations/${thread!.id}`, { method: "PATCH", body: JSON.stringify({ status }) })} onToggleFollow={toggleFollow}
        contextOpen={contextOpen} onOpenContext={() => setContextOpen(true)} />
        : <p role="status" className="p-4 text-sm">{t(read.loading ? "ops.loading" : "ops.select")}</p>}
    </section>
    {visibleThread && contextOpen && <div className="absolute inset-y-0 right-0 z-20 flex max-w-full bg-card shadow-xl 2xl:static 2xl:shadow-none"><ContextPanel thread={visibleThread} onToggleFollow={toggleFollow} onCollapse={() => setContextOpen(false)} /></div>}
    </div>
  </div>;
}
