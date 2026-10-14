"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogTitle } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import type { ConvPriority, ConvType, InboxItem, InboxResponse } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import type { MessageActor } from "@/lib/message-intents";
import { messageSessionEpoch } from "@/lib/message-reset";
import { verifyStaffMessageActor } from "@/lib/use-staff-message-session";
import { CHOICE_KINDS, creationPayload, type ChoiceKind, type SelectedChoices } from "@/lib/inbox-choices";
import { accessFailure, uncertainWrite } from "../operations/use-operation-read";
import { ChoicePicker } from "./choice-picker";

const control = "min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
const types: ConvType[] = ["general", "emergency", "support", "warranty", "vip"];
const priorities: ConvPriority[] = ["high", "medium", "low"];
type State = "ready" | "pending" | "acknowledged" | "error" | "uncertain";
type Payload = ReturnType<typeof creationPayload>;

export function ConversationCreate({ open, onClose, opener, actor, canWrite, isAuthorized, onDenied, onCreated, onOpen }: {
  open: boolean; onClose: () => void; opener: RefObject<HTMLButtonElement | null>;
  actor: MessageActor | null; canWrite: boolean; isAuthorized: () => boolean; onDenied: (error: unknown) => void;
  onCreated: () => void; onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const [subject, setSubject] = useState(""), [type, setType] = useState<ConvType>("general"), [priority, setPriority] = useState<ConvPriority>("medium");
  const [selected, setSelected] = useState<SelectedChoices>({}), [picker, setPicker] = useState<ChoiceKind | null>(null);
  const [state, setState] = useState<State>("ready"), [createdId, setCreatedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<InboxItem[] | null>(null), [checking, setChecking] = useState(false), [readError, setReadError] = useState(false);
  const [matchPage, setMatchPage] = useState<{ total: number; limit: number; offset: number } | null>(null);
  const [risk, setRisk] = useState(false);
  const captured = useRef<Payload | null>(null), locked = useRef<symbol | null>(null), mounted = useRef(true);
  const dispatchedWrite = useRef(false);
  const currentActor = useRef(actor); currentActor.current = actor;
  const pickerOpener = useRef<HTMLElement | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!open) setPicker(null); }, [open]);
  useEffect(() => {
    if (actor) return;
    // A suspended request cannot block fresh reconciliation. Its later finally
    // may retire only its own token, never a newer verified request's lock.
    locked.current = null;
    setPicker(null); setChecking(false); setMatches(null); setMatchPage(null); setRisk(false);
    setState(old => old === "pending" ? dispatchedWrite.current ? "uncertain" : "error" : old);
  }, [actor]);
  const blocked = !canWrite || state === "pending" || state === "uncertain" || state === "acknowledged" || checking;
  const edit = () => { if (state === "error") setState("ready"); };
  const owner = (actorAtStart: MessageActor) => {
    const epoch = messageSessionEpoch();
    return { actor: actorAtStart, current: () => mounted.current && currentActor.current === actorAtStart
      && messageSessionEpoch() === epoch && isAuthorized() };
  };
  const submit = async (again = false) => {
    if (!actor || !canWrite || !isAuthorized() || locked.current || state === "acknowledged" || checking
        || state === "uncertain" && !(again && risk && matches !== null && !readError)) return;
    const snapshot = again ? captured.current : creationPayload(subject, type, priority, selected);
    if (!snapshot) return;
    const requestOwner = owner(actor);
    const flight = Symbol("creation");
    locked.current = flight; captured.current = snapshot;
    dispatchedWrite.current = false;
    setState("pending"); setMatches(null); setMatchPage(null); setRisk(false); setReadError(false);
    let dispatched = false;
    try {
      const fresh = await verifyStaffMessageActor(requestOwner.current, requestOwner.actor);
      if (!requestOwner.current()) return;
      if (!fresh.canWrite) throw new ClientApiError("Conversation write access unavailable", 403);
      dispatched = true; dispatchedWrite.current = true;
      const result = await clientFetch<{ id: string }>("/conversations", { method: "POST", body: JSON.stringify(snapshot) });
      if (!requestOwner.current()) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.id)) throw new Error("Creation receipt has no valid UUID");
      setCreatedId(result.id); setState("acknowledged");
      onCreated(); // Later list/detail reads cannot rewrite this acknowledged POST.
    } catch (error) {
      if (!requestOwner.current()) return;
      if (accessFailure(error)) { setState("error"); onDenied(error); }
      else setState(dispatched && uncertainWrite(error) ? "uncertain" : "error");
    } finally { if (locked.current === flight) locked.current = null; }
  };
  const reconcile = async (offset = 0) => {
    if (!actor || locked.current || checking || state !== "uncertain" || !captured.current || !isAuthorized()) return;
    const snapshot = captured.current, requestOwner = owner(actor);
    const flight = Symbol("reconciliation");
    locked.current = flight; setChecking(true); setReadError(false); setRisk(false);
    try {
      await verifyStaffMessageActor(requestOwner.current, requestOwner.actor);
      if (!requestOwner.current()) return;
      // Expose the complete search through bounded pages, including ambiguous
      // blank subjects. Neither a page nor a single match acknowledges a POST.
      const query = new URLSearchParams({ view: "all", limit: "50", offset: String(offset) });
      if (snapshot.subject) query.set("q", snapshot.subject);
      const page = await clientFetch<InboxResponse>(`/conversations?${query}`);
      if (!requestOwner.current()) return;
      if (page.offset !== offset || page.limit <= 0) throw new Error("Invalid reconciliation page");
      setMatches(page.items.filter(row => row.subject === snapshot.subject
        && row.conv_type === snapshot.conv_type && row.priority === snapshot.priority));
      setMatchPage({ total: page.total, limit: page.limit, offset: page.offset });
    } catch (error) {
      if (!requestOwner.current()) return;
      if (accessFailure(error)) onDenied(error);
      else setReadError(true);
    } finally {
      if (locked.current === flight) locked.current = null;
      if (requestOwner.current()) setChecking(false);
    }
  };
  const startNew = () => {
    if (locked.current || state === "uncertain" || checking) return;
    setSubject(""); setType("general"); setPriority("medium"); setSelected({});
    setState("ready"); setCreatedId(null); setMatches(null); setMatchPage(null); setRisk(false); captured.current = null;
  };
  const openThread = (id: string) => { if (isAuthorized()) { onOpen(id); onClose(); } };
  return <>
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent hideClose aria-describedby={undefined}
        onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto p-4 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DialogTitle>{t("inbox.create.title")}</DialogTitle>
          <button type="button" className={control} onClick={onClose}>{t("common.close")}</button>
        </div>
        <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
          <fieldset disabled={blocked} className="min-w-0 space-y-3">
            <label className="block text-sm">{t("inbox.create.subject")}
              <input value={subject} maxLength={200} className={`${control} mt-1 w-full`}
                onChange={event => { edit(); setSubject(event.target.value); }} />
            </label>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <label className="min-w-0 text-sm">{t("inbox.create.type")}
                <select className={`${control} mt-1 w-full`} value={type} onChange={event => { edit(); setType(event.target.value as ConvType); }}>
                  {types.map(value => <option key={value} value={value}>{t(`inbox.type.${value}`)}</option>)}
                </select>
              </label>
              <label className="min-w-0 text-sm">{t("inbox.create.priority")}
                <select className={`${control} mt-1 w-full`} value={priority} onChange={event => { edit(); setPriority(event.target.value as ConvPriority); }}>
                  {priorities.map(value => <option key={value} value={value}>{t(`inbox.priority.${value}`)}</option>)}
                </select>
              </label>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{CHOICE_KINDS.map(kind => <div key={kind} className="min-w-0">
              <button type="button" className={`${control} w-full text-left`} onClick={event => { pickerOpener.current = event.currentTarget; setPicker(kind); }}>{t(`inbox.choice.${kind}`)}</button>
              {selected[kind] && <div className="mt-1 text-xs"><p>{selected[kind]!.label}</p><p className="text-muted-foreground">{selected[kind]!.id}</p></div>}
            </div>)}</div>
          </fieldset>
          {state !== "ready" && <div role={state === "error" || state === "uncertain" ? "alert" : "status"} className="space-y-2 text-sm">
            <p>{t(`inbox.create.${state}`)}</p>
            {createdId && state === "acknowledged" && <><p>{createdId}</p>
              <button type="button" className={control} onClick={() => openThread(createdId)}>{t("inbox.create.open_created")}</button>
              <button type="button" className={control} onClick={startNew}>{t("inbox.create.start_new")}</button></>}
          </div>}
          {state === "uncertain" && <div className="space-y-3 text-sm">
            <button type="button" className={control} disabled={checking} onClick={() => void reconcile()}>{t(checking ? "inbox.create.checking" : "inbox.create.reconcile")}</button>
            {readError && <p role="alert">{t("inbox.create.read_error")}</p>}
            {matches !== null && <>
              <p>{t("inbox.create.possible_matches")}</p>
              {!matches.length && <p>{t("inbox.create.no_possible_matches")}</p>}
              {matches.map(row => <button type="button" disabled={checking} className={`${control} flex w-full flex-col items-start text-left`} key={row.id} onClick={() => openThread(row.id)}>
                <span>{row.subject ?? t("inbox.conversation")}</span><span>{row.id}</span>
              </button>)}
              {matchPage && <div className="space-y-2">
                <p>{t("inbox.create.match_pages", { total: matchPage.total, offset: matchPage.offset })}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={control} disabled={checking || matchPage.offset === 0}
                    onClick={() => void reconcile(Math.max(0, matchPage.offset - matchPage.limit))}>{t("inbox.choice.previous")}</button>
                  <button type="button" className={control} disabled={checking || matchPage.offset + matchPage.limit >= matchPage.total}
                    onClick={() => void reconcile(matchPage.offset + matchPage.limit)}>{t("inbox.choice.next")}</button>
                </div>
              </div>}
              <p>{t("inbox.create.duplicate_risk")}</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
                <input type="checkbox" className="size-5" checked={risk} onChange={event => setRisk(event.target.checked)} />{t("inbox.create.acknowledge_risk")}
              </label>
              <button type="button" className={control} disabled={!risk || checking || readError || !canWrite} onClick={() => void submit(true)}>{t("inbox.create.create_again")}</button>
            </>}
          </div>}
          <button type="submit" className={`${control} w-full font-medium`} disabled={blocked}>{t("inbox.create.submit")}</button>
        </form>
      </DialogContent>
    </Dialog>
    {picker && open && actor && <ChoicePicker kind={picker} selected={selected} actor={actor} enabled={!blocked}
      isAuthorized={isAuthorized} onDenied={onDenied} opener={pickerOpener} onClose={() => setPicker(null)}
      onChoose={value => { edit(); setSelected(old => { const next = { ...old }; if (value) next[picker] = value; else delete next[picker]; return next; }); }} />}
  </>;
}
