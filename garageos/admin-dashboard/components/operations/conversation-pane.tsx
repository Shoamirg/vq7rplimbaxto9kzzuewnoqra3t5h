"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { CaseDetail, ConvMessage, ThreadDetail } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { enumLabel, operationControl, relTime } from "./shared";
import { accessFailure, uncertainWrite, useOperationRead } from "./use-operation-read";

type Draft = { text: string; revision: number };
type SendOutcome = "saved" | "failed" | "uncertain";
export function ConversationPane({ detail, identity, canWrite, onDenied, now }: {
  detail: CaseDetail | null; identity: string | null; canWrite: boolean; onDenied: (error: unknown) => void; now: number;
}) {
  const { t } = useI18n();
  const caseId = detail?.id ?? null;
  const current = useRef(caseId); current.current = caseId;
  // Component remains mounted when changing phone panes/selection. No draft is
  // persisted to storage or shared with another case or message kind.
  const drafts = useRef<Record<string, Draft>>({});
  const [, renderDraft] = useState(0);
  const [modes, setModes] = useState<Record<string, boolean>>({});
  const internal = caseId ? modes[caseId] ?? false : false;
  const draftKey = `${caseId}:${internal ? "note" : "reply"}`;
  const text = drafts.current[draftKey]?.text ?? "";
  const [pending, setPending] = useState(false), guard = useRef(false);
  const [outcomes, setOutcomes] = useState<Record<string, SendOutcome>>({});
  const thread = useOperationRead<ThreadDetail>(caseId ? identity : null, caseId ? `/cases/${caseId}/conversation` : null, !pending, onDenied);
  const convo = thread.data?.case_id === caseId ? thread.data : null;
  const outcome = caseId ? outcomes[caseId] : undefined;
  const clearOutcome = (id: string) => setOutcomes(old => { const next = { ...old }; delete next[id]; return next; });
  const edit = (value: string) => {
    drafts.current[draftKey] = { text: value, revision: (drafts.current[draftKey]?.revision ?? 0) + 1 };
    renderDraft(old => old + 1);
  };
  const reconcile = async () => {
    const target = current.current;
    if (!target || guard.current) return;
    const data = await thread.refresh();
    if (data?.case_id === target && current.current === target) clearOutcome(target);
  };
  const send = async () => {
    if (!caseId || !convo || !canWrite || guard.current || thread.error || outcome === "uncertain" || !text.trim()) return;
    const replyChannel = convo.last_channel && convo.last_channel !== "internal" ? convo.last_channel
      : [...convo.messages].reverse().find(message => !message.is_internal && message.channel !== "internal")?.channel ?? "web";
    const target = { caseId, threadId: convo.id, body: text, draftKey, revision: drafts.current[draftKey]?.revision, internal, channel: replyChannel };
    guard.current = true; setPending(true); thread.invalidate(); clearOutcome(target.caseId);
    try {
      await clientFetch(`/conversations/${target.threadId}/messages`, {
        method: "POST", body: JSON.stringify({ body: target.body, channel: target.channel, author_role: "dispatcher", kind: target.internal ? "note" : "text", is_internal: target.internal }),
      });
      if (drafts.current[target.draftKey]?.revision === target.revision) {
        drafts.current[target.draftKey] = { text: "", revision: (target.revision ?? 0) + 1 }; renderDraft(old => old + 1);
      }
      setOutcomes(old => ({ ...old, [target.caseId]: "saved" }));
    } catch (error) {
      if (accessFailure(error)) onDenied(error);
      else setOutcomes(old => ({ ...old, [target.caseId]: uncertainWrite(error) ? "uncertain" : "failed" }));
    } finally { guard.current = false; setPending(false); }
  };
  if (!detail) return <aside aria-label={t("ops.conversation")} className="grid min-h-0 flex-1 place-items-center p-4 text-sm text-foreground">{t("ops.select")}</aside>;
  return <aside aria-label={t("ops.conversation")} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="space-y-2 border-b border-border p-3 [overflow-wrap:anywhere]">
      <h2 tabIndex={-1} data-conversation-heading className="font-bold focus-visible:outline-2 focus-visible:outline-primary">{t("ops.conversation")}</h2>
      <p className="text-sm font-medium">{detail.title}</p><p className="text-xs text-foreground">{t("ops.thread_shared")}</p>
      {convo && <Link className={cn(operationControl, "inline-flex items-center")} href={`/inbox?c=${convo.id}`}>{t("ops.inbox")}</Link>}
      <button className={operationControl} disabled={pending || thread.loading} onClick={() => void reconcile()}>{t("ops.refresh_thread")}</button>
    </div>
    {!!thread.error && <div role="alert" className="space-y-2 p-3 text-sm"><p>{t(convo ? "ops.stale" : thread.error instanceof ClientApiError && thread.error.code === "CASE_CONVERSATION_UNAVAILABLE" ? "ops.thread_not_started" : "ops.read_error")}</p><button className={operationControl} onClick={() => void reconcile()}>{t("ops.retry")}</button></div>}
    {outcome && <p role={outcome === "saved" ? "status" : "alert"} className="p-3 text-sm">{t(outcome === "saved" ? "ops.sent" : outcome === "uncertain" ? "ops.send_uncertain" : "ops.send_failed")}</p>}
    <div aria-busy={thread.loading} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 [overflow-wrap:anywhere]">
      {!convo && !thread.error && <p role="status" className="text-sm">{t("ops.loading")}</p>}
      {convo?.messages.length === 0 && <p className="text-sm text-foreground">{t("ops.no_messages")}</p>}
      {convo?.messages.map(message => <Bubble key={message.id} message={message} now={now} />)}
    </div>
    <div className="min-w-0 space-y-2 border-t border-border p-3">
      {!canWrite && <p className="text-sm">{t("ops.readonly")}</p>}
      <div className="flex flex-wrap gap-2"><button className={cn(operationControl, !internal && "bg-primary/10 font-bold text-foreground")} aria-pressed={!internal} onClick={() => setModes(old => ({ ...old, [caseId!]: false }))}>{t("ops.reply")}</button><button className={cn(operationControl, internal && "bg-primary/10 font-bold text-foreground")} aria-pressed={internal} onClick={() => setModes(old => ({ ...old, [caseId!]: true }))}>{t("ops.note")}</button></div>
      <label className="block text-sm"><span>{t("ops.message")}</span><textarea aria-label={t("ops.message")} rows={3} value={text} disabled={!canWrite} onChange={event => edit(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
      }} className="mt-1 min-h-11 w-full min-w-0 resize-y rounded-lg border border-border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" /></label>
      <button className={cn(operationControl, "w-full bg-primary text-primary-foreground hover:bg-primary/90")} disabled={!canWrite || pending || !convo || !!thread.error || outcome === "uncertain" || !text.trim()} onClick={() => void send()}>{pending ? t("ops.sending") : t("ops.send")}</button>
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
