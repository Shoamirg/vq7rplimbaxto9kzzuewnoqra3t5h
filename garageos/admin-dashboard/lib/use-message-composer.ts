"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageIntentStore, MessageStorageError } from "./message-intents";
import type { MessageActor, MessageIntent, MessageMode, MessagePayload, IntentStatus } from "./message-intents";
import { MESSAGE_LOGOUT_EVENT, messageSessionEpoch } from "./message-reset";

const changed = "garageos:message-intents-changed";
const inFlight = new Set<string>();
const actorKey = (actor: MessageActor | null) => actor ? `${actor.center}:${actor.kind}:${actor.id}` : null;
// A valid ACK remains known if its browser receipt cannot yet be retired.
// Metadata only; no server message content or authentication credentials.
const knownAcknowledgements = new Set<string>();
const acknowledgementKey = (intent: MessageIntent, epoch: string) => `${epoch}:${actorKey(intent.actor)}:${intent.conversation}:${intent.key}`;

type Options<T> = {
  actor: MessageActor | null; conversation: string | null; mode: MessageMode; ready: boolean;
  canSubmit?: boolean;
  isAuthorized?: () => boolean;
  readIdentity?: string | number;
  request: (intent: MessageIntent) => Promise<T>;
  onAcknowledged: (message: T, intent: MessageIntent) => void;
  onDenied: (error: unknown) => void;
};

function failure(error: unknown): IntentStatus {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if ([401, 403, 404].includes(status)) return "suspended";
  if (status === 409) return "conflict";
  if (status >= 400 && status < 500 && ![408, 429].includes(status)) return "rejected";
  return "uncertain";
}

/** Shared synchronous submission and storage lifecycle for the three composers.
 * Actor comes from fresh auth; ready comes from the current authorized thread
 * read. No restored receipt causes a POST until a deliberate user action.
 */
export function useMessageComposer<T extends { id: string }>(options: Options<T>) {
  const current = useRef(options); current.current = options;
  const store = useRef<MessageIntentStore | null>(null);
  const mounted = useRef(true);
  const [, render] = useState(0);
  const [storageError, setStorageError] = useState<MessageStorageError | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, "saved">>({});
  const fallbackDrafts = useRef<Record<string, string>>({});
  const identity = actorKey(options.actor);
  const epoch = messageSessionEpoch();
  const authorization = useRef({ actor: options.actor, epoch });
  // A changed cookie alone cannot turn a cached principal into fresh authority.
  // A newly verified actor object establishes the new authenticated generation.
  if (authorization.current.actor !== options.actor) authorization.current = { actor: options.actor, epoch };
  const currentSession = () => authorization.current.epoch === messageSessionEpoch();
  const bump = useCallback(() => { if (mounted.current) render(value => value + 1); }, []);
  const announce = useCallback(() => { window.dispatchEvent(new Event(changed)); }, []);

  useEffect(() => {
    mounted.current = true;
    const logout = () => {
      store.current = null; fallbackDrafts.current = {}; knownAcknowledgements.clear(); inFlight.clear();
      setOutcomes({}); setStorageError(null);
      current.current.onDenied({ status: 401 });
      bump();
    };
    window.addEventListener(changed, bump);
    window.addEventListener(MESSAGE_LOGOUT_EVENT, logout);
    return () => { mounted.current = false; window.removeEventListener(changed, bump); window.removeEventListener(MESSAGE_LOGOUT_EVENT, logout); };
  }, [bump]);
  useEffect(() => {
    store.current = null; fallbackDrafts.current = {}; setOutcomes({}); setStorageError(null);
    if (options.actor && !currentSession()) { current.current.onDenied({ status: 401 }); bump(); return; }
    if (options.actor) {
      try { store.current = new MessageIntentStore(options.actor, window.sessionStorage); }
      catch (error) { setStorageError(error instanceof MessageStorageError ? error : new MessageStorageError("unavailable")); }
    }
    bump();
    // Identity, rather than a newly allocated actor object, owns the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, epoch, bump]);

  const storageFailure = (error: unknown) => {
    if (mounted.current) setStorageError(error instanceof MessageStorageError ? error : new MessageStorageError("unavailable"));
  };
  const draftKey = `${identity}:${options.conversation}:${options.mode}`;
  let text = "", revision = 0, intent: MessageIntent | undefined;
  if (options.actor && options.ready && options.conversation && currentSession()) {
    text = fallbackDrafts.current[draftKey] ?? "";
    try {
      if (store.current && actorKey(store.current.actor) === identity) {
        const draft = store.current.draft(options.conversation, options.mode);
        text = fallbackDrafts.current[draftKey] ?? draft.text; revision = draft.revision;
        intent = store.current.unresolved(options.conversation)[0];
      }
    } catch { text = ""; intent = undefined; /* Purged/changed identities cannot expose a draft. */ }
  }
  const pending = !!identity && !!options.conversation && inFlight.has(`${epoch}:${identity}:${options.conversation}`);
  const draftFor = (mode: MessageMode = current.current.mode) => {
    const target = current.current;
    if (!target.actor || !target.ready || !target.conversation || !currentSession()) return "";
    const key = `${actorKey(target.actor)}:${target.conversation}:${mode}`;
    let text = fallbackDrafts.current[key] ?? "";
    try {
      if (!store.current || actorKey(store.current.actor) !== actorKey(target.actor)) throw new MessageStorageError("identity");
      text = fallbackDrafts.current[key] ?? store.current.draft(target.conversation, mode).text;
    } catch { /* A storage warning remains visible; the active fallback draft is retained. */ }
    return text;
  };
  const edit = (value: string, mode: MessageMode = current.current.mode) => {
    const target = current.current;
    if (!target.actor || !target.ready || !target.conversation || !currentSession()) return;
    const key = `${actorKey(target.actor)}:${target.conversation}:${mode}`;
    fallbackDrafts.current[key] = value;
    try {
      if (!store.current || actorKey(store.current.actor) !== actorKey(target.actor)) throw new MessageStorageError("identity");
      store.current.edit(target.conversation, mode, value);
      delete fallbackDrafts.current[key]; setStorageError(null); announce();
    } catch (error) { storageFailure(error); bump(); }
  };
  const dispatch = async (captured: MessageIntent, targetStore: MessageIntentStore) => {
    const target = current.current, capturedActor = actorKey(captured.actor)!;
    const capturedEpoch = messageSessionEpoch(), flight = `${capturedEpoch}:${capturedActor}:${captured.conversation}`;
    if (inFlight.has(flight) || actorKey(target.actor) !== capturedActor || !target.ready || !currentSession() || target.canSubmit === false || target.isAuthorized?.() === false) return;
    inFlight.add(flight);
    try { targetStore.status(captured.key, "pending"); }
    catch (error) { inFlight.delete(flight); storageFailure(error); announce(); return; }
    announce();
    let message: T;
    try {
      message = await target.request(captured);
      if (!message || typeof message.id !== "string" || !/^[0-9a-f-]{36}$/i.test(message.id)) throw new Error("Invalid message acknowledgement");
    } catch (error) {
      if (capturedEpoch !== messageSessionEpoch()) { inFlight.delete(flight); announce(); return; }
      const status = failure(error);
      try { targetStore.status(captured.key, status); } catch (storage) { storageFailure(storage); }
      const currentActor = actorKey(current.current.actor);
      const targetLocal = typeof error === "object" && error !== null && "status" in error && error.status === 404;
      const currentTarget = current.current.conversation === captured.conversation && current.current.readIdentity === target.readIdentity;
      if (status === "suspended" && (!currentActor || currentActor === capturedActor) && (!targetLocal || currentTarget)) current.current.onDenied(error);
      inFlight.delete(flight); announce(); return;
    }
    // A read denial/logout/identity change during the write must not let a late
    // completion restore protected UI or delete its suspended recovery receipt.
    if (capturedEpoch !== messageSessionEpoch()) { inFlight.delete(flight); announce(); return; }
    const currentActor = actorKey(current.current.actor);
    if ((currentActor && currentActor !== capturedActor) || current.current.isAuthorized?.() === false) {
      try { targetStore.status(captured.key, "suspended"); } catch { /* Purged on confirmed identity/logout. */ }
    } else {
      knownAcknowledgements.add(acknowledgementKey(captured, capturedEpoch));
      try {
        targetStore.acknowledge(captured.key);
        knownAcknowledgements.delete(acknowledgementKey(captured, capturedEpoch));
        if (mounted.current) setOutcomes(old => ({ ...old, [`${capturedActor}:${captured.conversation}`]: "saved" }));
      } catch (error) {
        if (error instanceof MessageStorageError && error.reason === "identity") {
          knownAcknowledgements.delete(acknowledgementKey(captured, capturedEpoch));
          inFlight.delete(flight); announce(); return;
        }
        storageFailure(error);
        // The response acknowledged persistence. A storage failure does not
        // turn it into a rejected send; a retained receipt can replay safely.
        if (mounted.current) setOutcomes(old => ({ ...old, [`${capturedActor}:${captured.conversation}`]: "saved" }));
      }
      if (mounted.current && currentActor === capturedActor) {
        try { current.current.onAcknowledged(message, captured); }
        finally { inFlight.delete(flight); announce(); }
        return;
      }
    }
    inFlight.delete(flight); announce();
  };
  const send = (payload: MessagePayload) => {
    const target = current.current, activeStore = store.current;
    if (!target.actor || !target.ready || !currentSession() || target.canSubmit === false || target.isAuthorized?.() === false || !target.conversation || !payload.body.trim()
        || inFlight.has(`${messageSessionEpoch()}:${actorKey(target.actor)}:${target.conversation}`)) return;
    try {
      if (!activeStore || actorKey(activeStore.actor) !== actorKey(target.actor)) throw new MessageStorageError("identity");
      const captured = activeStore.capture(target.conversation, target.mode, payload);
      setOutcomes(old => { const next = { ...old }; delete next[`${actorKey(captured.actor)}:${captured.conversation}`]; return next; });
      setStorageError(null); void dispatch(captured, activeStore);
    } catch (error) { storageFailure(error); }
  };
  const retry = () => {
    const target = current.current, activeStore = store.current;
    if (!activeStore || !target.actor || actorKey(activeStore.actor) !== actorKey(target.actor) || !target.ready || !currentSession() || target.canSubmit === false || target.isAuthorized?.() === false || !target.conversation) return;
    try {
      const captured = activeStore.unresolved(target.conversation)[0];
      if (captured && !knownAcknowledgements.has(acknowledgementKey(captured, messageSessionEpoch())) && ["uncertain", "suspended"].includes(captured.status)) void dispatch(captured, activeStore);
    } catch (error) { storageFailure(error); }
  };
  const resolve = () => {
    if (!intent || !store.current || actorKey(store.current.actor) !== identity || pending || !options.ready) return;
    try { store.current.resolve(intent.key); setStorageError(null); announce(); }
    catch (error) { storageFailure(error); }
  };
  const retryStorage = () => {
    const target = current.current;
    if (!target.actor || !target.ready || !currentSession()) return;
    try {
      store.current = new MessageIntentStore(target.actor, window.sessionStorage);
      if (target.conversation && fallbackDrafts.current[draftKey] !== undefined) {
        store.current.edit(target.conversation, target.mode, fallbackDrafts.current[draftKey]);
        delete fallbackDrafts.current[draftKey];
      }
      if (target.conversation) {
        for (const receipt of store.current.unresolved(target.conversation)) {
          if (knownAcknowledgements.has(acknowledgementKey(receipt, messageSessionEpoch()))) {
            store.current.acknowledge(receipt.key);
            knownAcknowledgements.delete(acknowledgementKey(receipt, messageSessionEpoch()));
          }
        }
      }
      setStorageError(null); announce();
    } catch (error) { storageFailure(error); }
  };
  const acknowledged = !!intent && knownAcknowledgements.has(acknowledgementKey(intent, epoch));
  return { text, intent, pending, storageError, acknowledged, edit, draftFor, send, retry, resolve, retryStorage,
    canRecover: options.canSubmit !== false && options.ready && currentSession() && options.isAuthorized?.() !== false,
    newerDraft: !!intent && (options.mode !== intent.mode || revision !== intent.revision || text !== intent.payload.body),
    saved: !!options.actor && options.ready && currentSession() && !!options.conversation && (acknowledged || outcomes[`${identity}:${options.conversation}`] === "saved") };
}
