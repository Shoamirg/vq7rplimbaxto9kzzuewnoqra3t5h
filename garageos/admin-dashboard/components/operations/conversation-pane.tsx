"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { CaseDetail, ConvMessage, ThreadDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import type { MessageActor, MessageMode } from "@/lib/message-intents";
import { useMessageComposer } from "@/lib/use-message-composer";
import { verifyStaffMessageActor } from "@/lib/use-staff-message-session";
import { MessageSubmissionStatus } from "@/components/message-submission-status";
import { enumLabel, operationControl, relTime } from "./shared";
import { useOperationRead } from "./use-operation-read";

export function ConversationPane({ detail, identity, actor, isAuthorized, canWrite, onDenied, now }: {
  detail: CaseDetail | null; identity: string | null; actor: MessageActor | null; isAuthorized: () => boolean;
  canWrite: boolean; onDenied: (error: unknown) => void; now: number;
}) {
  const { t } = useI18n(), caseId = detail?.id ?? null;
  const readKey = caseId && actor ? `${actor.center}:${actor.id}:${identity}` : null;
  const current = useRef({ caseId, readKey }); current.current = { caseId, readKey };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [modes, setModes] = useState<Record<string, MessageMode>>({});
  const mode = caseId ? modes[caseId] ?? "reply" : "reply", internal = mode === "note";
  // Pause only the captured read. Another selection continues loading while its
  // predecessor's POST is pending. The shared controller owns the write guard.
  const [pausedRead, setPausedRead] = useState<string | null>(null);
  const thread = useOperationRead<ThreadDetail>(readKey, caseId ? `/cases/${caseId}/conversation` : null,
    !!actor && isAuthorized() && (!pausedRead || pausedRead !== readKey), onDenied);
  const convo = thread.data?.case_id === caseId ? thread.data : null;
  const [acknowledged, setAcknowledged] = useState<Record<string, ConvMessage[]>>({});
  const composer = useMessageComposer<ConvMessage>({
    actor, conversation: convo?.id ?? null, mode, ready: !!convo,
    canSubmit: canWrite && !thread.loading && !thread.error, isAuthorized, readIdentity: readKey ?? undefined,
    request: async intent => {
      const capturedRead = current.current.readKey;
      setPausedRead(capturedRead); thread.invalidate();
      try {
        // Departed pre-dispatch auth reads must not mutate a new surface's
        // storage or dispatch. Already-dispatched writes still retire late ACKs.
        const fresh = await verifyStaffMessageActor(() => mounted.current && isAuthorized(), intent.actor);
        if (!fresh.canWrite) throw new ClientApiError("Message write access unavailable", 403);
        return await clientFetch<ConvMessage>(`/conversations/${intent.conversation}/messages`, {
          method: "POST", headers: { "Idempotency-Key": intent.key }, body: JSON.stringify(intent.payload),
        });
      } finally { setPausedRead(null); }
    },
    onAcknowledged: (message, intent) => {
      // Captured ACK updates only its own thread. A fresh GET can subsequently
      // confirm it; failure of that GET does not change the acknowledged result.
      if (convo?.id !== intent.conversation || !isAuthorized()) return;
      thread.invalidate();
      setAcknowledged(old => ({ ...old, [intent.conversation]: [...(old[intent.conversation] ?? []).filter(row => row.id !== message.id), message] }));
      // Re-enabling the captured read after POST starts exactly one fresh GET.
      // A second manual refresh here would abort/mask its first result.
    }, onDenied,
  });
  useEffect(() => {
    if (caseId && composer.intent && modes[caseId] === undefined) {
      setModes(old => ({ ...old, [caseId]: composer.intent!.mode }));
    }
  }, [caseId, composer.intent, modes]);
  const reconcile = () => { if (!composer.pending) void thread.refresh(); };
  const send = () => {
    if (!convo) return;
    const channel = convo.last_channel && convo.last_channel !== "internal" ? convo.last_channel
      : [...convo.messages].reverse().find(message => !message.is_internal && message.channel !== "internal")?.channel ?? "web";
    composer.send({ body: composer.text, channel, author_role: "dispatcher", kind: internal ? "note" : "text", is_internal: internal });
  };
  const messages = convo ? [...convo.messages, ...(acknowledged[convo.id] ?? []).filter(row => !convo.messages.some(saved => saved.id === row.id))] : [];
  if (!detail) return <aside aria-label={t("ops.conversation")} className="grid min-h-0 flex-1 place-items-center p-4 text-sm text-foreground">{t("ops.select")}</aside>;
  return <aside aria-label={t("ops.conversation")} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="space-y-2 border-b border-border p-3 [overflow-wrap:anywhere]">
      <h2 tabIndex={-1} data-conversation-heading className="font-bold focus-visible:outline-2 focus-visible:outline-primary">{t("ops.conversation")}</h2>
      <p className="text-sm font-medium">{detail.title}</p><p className="text-xs text-foreground">{t("ops.thread_shared")}</p>
      {convo && <Link className={cn(operationControl, "inline-flex items-center")} href={`/inbox?c=${convo.id}`}>{t("ops.inbox")}</Link>}
      <button className={operationControl} disabled={composer.pending || thread.loading} onClick={reconcile}>{t("ops.refresh_thread")}</button>
    </div>
    {!!thread.error && <div role="alert" className="space-y-2 p-3 text-sm"><p>{t(composer.saved ? "message.refresh_error" : convo ? "ops.stale" : thread.error instanceof ClientApiError && thread.error.code === "CASE_CONVERSATION_UNAVAILABLE" ? "ops.thread_not_started" : "ops.read_error")}</p><button className={operationControl} onClick={reconcile}>{t("ops.retry")}</button></div>}
    <div role="region" aria-label={t("ops.conversation")} tabIndex={0} aria-busy={thread.loading} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-primary">
      {!convo && !thread.error && <p role="status" className="text-sm">{t("ops.loading")}</p>}
      {convo && messages.length === 0 && <p className="text-sm text-foreground">{t("ops.no_messages")}</p>}
      {messages.map(message => <Bubble key={message.id} message={message} now={now} />)}
    </div>
    <div className="min-w-0 max-h-[65%] space-y-2 overflow-y-auto border-t border-border p-3">
      <MessageSubmissionStatus composer={composer} />
      {!canWrite && <p className="text-sm">{t("ops.readonly")}</p>}
      <div className="flex flex-wrap gap-2">{(["reply", "note"] as const).map(value => <button key={value} className={cn(operationControl, mode === value && "bg-primary/10 font-bold text-foreground")} aria-pressed={mode === value} onClick={() => setModes(old => ({ ...old, [caseId!]: value }))}>{t(`ops.${value}`)}</button>)}</div>
      <label className="block text-sm"><span>{t("ops.message")}</span><textarea aria-label={t("ops.message")} maxLength={64 * 1024} rows={3} value={composer.text} disabled={!actor || !convo || !canWrite || !!thread.error} onChange={event => composer.edit(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
      }} className="mt-1 min-h-11 w-full min-w-0 resize-y rounded-lg border border-border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" /></label>
      <button className={cn(operationControl, "w-full bg-primary text-primary-foreground hover:bg-primary/90")} disabled={!canWrite || composer.pending || !convo || thread.loading || !!thread.error || !!composer.intent || !!composer.storageError || !composer.text.trim()} onClick={send}>{composer.pending ? t("ops.sending") : t("ops.send")}</button>
    </div>
  </aside>;
}

function Bubble({ message: m, now }: { message: ConvMessage; now: number }) {
  const { t, fmt } = useI18n();
  return <article className={cn("min-w-0 rounded-xl border border-border p-3 text-sm", m.is_internal ? "bg-primary/5" : "bg-card")}>
    <p className="font-medium">{m.author_name ?? enumLabel(t, "role", m.author_role)}</p>
    {m.is_internal && <p className="text-xs font-medium">{t("ops.note")}</p>}
    <p className="whitespace-pre-wrap">{m.body}</p>
    {m.attachments.map(attachment => <p key={attachment.id} className="mt-1 text-xs">{attachment.label}</p>)}
    {m.created_at && <time dateTime={m.created_at} title={fmt.date(m.created_at)} className="text-xs text-foreground">{relTime(m.created_at, now, t, fmt.number)}</time>}
  </article>;
}
