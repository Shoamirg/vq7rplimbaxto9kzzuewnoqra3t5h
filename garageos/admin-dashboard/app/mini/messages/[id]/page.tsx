"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageIcon, Send } from "lucide-react";
import { miniFetch, MiniApiError, renewMiniSession } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { MeResponse, ThreadMessage, ThreadResponse } from "@/lib/mini/types";
import { confirmMessageActor, MessageStorageError, type MessageActor } from "@/lib/message-intents";
import { useMessageComposer } from "@/lib/use-message-composer";
import { MessageSubmissionStatus } from "@/components/message-submission-status";
import { ListSkeleton } from "@/components/mini/ui";

type ReadState = {
  selection: number; thread: ThreadResponse | null; actor: MessageActor | null;
  loading: boolean; error: boolean; storageError: boolean; denied: boolean;
};
const empty: ReadState = { selection: 0, thread: null, actor: null, loading: true, error: false, storageError: false, denied: false };
const control = "min-h-11 min-w-11 rounded-xl border border-slate-300 bg-card px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary-600 disabled:opacity-50";

export default function ThreadPage() {
  const params = useParams<{ id: string }>(), id = params?.id ?? null;
  const { t, fmt } = useI18n();
  const [state, setState] = useState<ReadState>(empty);
  const selection = useRef({ id, version: 1 });
  if (selection.current.id !== id) selection.current = { id, version: selection.current.version + 1 };
  const sequence = useRef(0), read = useRef<AbortController | null>(null), denied = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null), mounted = useRef(true);
  const invalidate = useCallback(() => { sequence.current++; read.current?.abort(); read.current = null; }, []);
  const onDenied = useCallback(() => {
    denied.current = true; invalidate();
    setState({ selection: selection.current.version, thread: null, actor: null, loading: false, error: false, storageError: false, denied: true });
  }, [invalidate]);
  const load = useCallback(async (verify = false) => {
    const target = { ...selection.current };
    if (!target.id) return;
    invalidate(); const generation = sequence.current, controller = new AbortController(); read.current = controller;
    if (verify) denied.current = false;
    setState(old => old.selection === target.version && !verify
      ? { ...old, loading: true, error: false, storageError: false }
      : { ...empty, selection: target.version });
    const current = () => mounted.current && !controller.signal.aborted && generation === sequence.current
      && target.version === selection.current.version && !denied.current;
    try {
      if (verify) await renewMiniSession();
      // Actual auth/me plus the owned thread GET authorize restoration.
      const me = await miniFetch<MeResponse>("/me", { signal: controller.signal });
      const actor: MessageActor = { center: me.garage.id, kind: "customer", id: me.id };
      if (!current()) return;
      try { confirmMessageActor(actor, window.sessionStorage); } catch { /* The composer surfaces storage failure before dispatch. */ }
      setState(old => ({ ...old, actor, thread: old.actor?.id === actor.id && old.actor.center === actor.center ? old.thread : null }));
      const thread = await miniFetch<ThreadResponse>(`/messages/${target.id}`, { signal: controller.signal }, actor);
      if (thread.id !== target.id) throw new MiniApiError("Conversation unavailable", 404);
      if (current()) setState({ selection: target.version, thread, actor, loading: false, error: false, storageError: false, denied: false });
    } catch (error) {
      if (!current()) return;
      if (error instanceof MessageStorageError) setState({ ...empty, selection: target.version, loading: false, error: true, storageError: true });
      else if (error instanceof MiniApiError && [401, 403, 404].includes(error.status)) onDenied();
      else setState(old => ({ ...old, selection: target.version, loading: false, error: true }));
    } finally { if (read.current === controller) read.current = null; }
  }, [invalidate, onDenied]);
  useEffect(() => {
    mounted.current = true; denied.current = false; void load();
    return () => { mounted.current = false; invalidate(); };
  }, [id, load, invalidate]);
  const matches = state.selection === selection.current.version && !state.denied && !state.storageError;
  const thread = matches ? state.thread : null, actor = matches ? state.actor : null;
  const composer = useMessageComposer<ThreadMessage>({
    actor, conversation: id, mode: "reply", ready: !!thread && !!actor,
    canSubmit: !state.loading && !state.error,
    isAuthorized: () => !denied.current,
    readIdentity: selection.current.version,
    request: intent => {
      // Older GETs cannot erase the POST acknowledgement.
      invalidate();
      return miniFetch<ThreadMessage>(`/messages/${intent.conversation}`, {
        method: "POST", headers: { "Idempotency-Key": intent.key }, body: JSON.stringify(intent.payload),
      }, intent.actor);
    },
    onAcknowledged: (message, intent) => {
      if (selection.current.id !== intent.conversation || denied.current) return;
      haptic("light");
      setState(old => old.thread?.id === intent.conversation && old.actor?.id === intent.actor.id
        ? { ...old, thread: { ...old.thread, messages: [...old.thread.messages.filter(row => row.id !== message.id), message] } }
        : old);
      void load();
    },
    onDenied,
  });
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread?.messages.length]);
  const send = () => composer.send({ body: composer.text });
  const sendDisabled = !thread || !actor || state.error || state.loading || composer.pending || !!composer.intent || !composer.text.trim();

  return <div className="flex min-h-[calc(100dvh-7rem)] min-w-0 flex-col [overflow-wrap:anywhere]">
    <Link href="/mini/messages" onClick={() => haptic("light")}
      className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary-600">
      <ArrowLeft className="size-4" aria-hidden />{t("mini.messages.title")}
    </Link>
    {state.denied && <div role="alert" className="space-y-3"><p>{t("message.auth")}</p><button className={control} onClick={() => void load(true)}>{t("message.verify")}</button></div>}
    {!state.denied && state.error && <div role="alert" className="space-y-3"><p>{t(state.storageError ? "message.storage" : composer.saved ? "message.refresh_error" : "message.read_error")}</p><button className={control} onClick={() => void load(state.storageError)}>{t(state.storageError ? "message.storage_retry" : "message.refresh")}</button></div>}
    {!thread && !state.denied && !state.error && <ListSkeleton rows={4} />}
    {thread && <>
      <h1 className="mb-3 px-1 text-lg font-bold text-foreground">{thread.subject ?? t("mini.home.conversation")}</h1>
      <div className="min-w-0 flex-1 space-y-2.5" aria-busy={state.loading}>
        {thread.messages.length === 0 && <p className="text-sm text-foreground">{t("message.empty")}</p>}
        {thread.messages.map(message => <div key={message.id} className={`flex min-w-0 ${message.from_me ? "justify-end" : "justify-start"}`}>
          <article className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${message.from_me ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground ring-1 ring-slate-900/5"}`}>
            {!message.from_me && message.author_name && <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{message.author_name}</p>}
            {message.attachments.map(attachment => <p key={attachment.id} className="mb-1 flex items-center gap-1.5 text-xs"><ImageIcon className="size-3.5" aria-hidden />{attachment.label}</p>)}
            {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
            {message.created_at && <time dateTime={message.created_at} className={`mt-1 block text-xs ${message.from_me ? "text-primary-foreground" : "text-muted-foreground"}`}>{fmt.date(message.created_at, { hour: "numeric", minute: "2-digit" })}</time>}
          </article>
        </div>)}
        <div ref={bottomRef} />
      </div>
      <div className="sticky bottom-24 mt-3 min-w-0 space-y-3 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-slate-900/6">
        <MessageSubmissionStatus composer={composer} />
        <div className="flex min-w-0 items-center gap-2">
          <input value={composer.text} onChange={event => composer.edit(event.target.value)} maxLength={65536}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (!sendDisabled) send(); } }}
            placeholder={t("mini.messages.compose")} aria-label={t("mini.messages.compose")}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary-600" />
          <button onClick={send} disabled={sendDisabled} aria-label={t("message.send")}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-conversion text-white focus-visible:outline-2 focus-visible:outline-primary-600 focus-visible:outline-offset-2 disabled:opacity-40"><Send className="size-4" aria-hidden /></button>
        </div>
      </div>
    </>}
  </div>;
}
