// Same-tab submission receipts. Callers must verify a fresh authenticated actor
// and current thread ownership before exposing drafts or dispatching a recovery.
// Storage contains no authentication credentials and confers no permissions.
import { completeMessageLogout, messageSessionEpoch, requireMessageResetEpoch, revokeMessageSession } from "./message-reset";
export type MessageActor = { center: string; kind: "staff" | "customer"; id: string };
export type MessageMode = "reply" | "note" | "announcement";
export type IntentStatus = "pending" | "uncertain" | "rejected" | "conflict" | "suspended";
export type MessagePayload = {
  body: string; channel?: string; author_role?: "dispatcher";
  kind?: "text" | "note" | "announcement"; is_internal?: boolean;
};
export type MessageDraft = { text: string; revision: number };
export type MessageIntent = {
  version: 1; key: string; actor: MessageActor; conversation: string;
  mode: MessageMode; revision: number; payload: MessagePayload; status: IntentStatus;
};
type Document = { version: 1; actor: MessageActor; drafts: Record<string, MessageDraft>; intents: MessageIntent[] };

const PREFIX = "garageos.message-intents.v1:";
const ACTIVE = PREFIX + "actor";
const RESET = "garageos.message-reset.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODES = ["reply", "note", "announcement"];
const STATUSES = ["pending", "uncertain", "rejected", "conflict", "suspended"];
const MAX_BYTES = 512 * 1024, MAX_TEXT = 64 * 1024, MAX_DRAFTS = 100, MAX_INTENTS = 64;

export class MessageStorageError extends Error {
  constructor(public reason: "unavailable" | "invalid" | "full" | "identity") {
    super("Message recovery storage " + reason);
    this.name = "MessageStorageError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}
function sameActor(a: MessageActor, b: MessageActor): boolean {
  return a.center.toLowerCase() === b.center.toLowerCase() && a.kind === b.kind && a.id.toLowerCase() === b.id.toLowerCase();
}
function actorValid(value: unknown): value is MessageActor {
  return object(value) && onlyKeys(value, ["center", "kind", "id"]) && typeof value.center === "string" && UUID.test(value.center)
    && typeof value.id === "string" && UUID.test(value.id) && (value.kind === "staff" || value.kind === "customer");
}
function draftValid(value: unknown): value is MessageDraft {
  return object(value) && onlyKeys(value, ["text", "revision"]) && typeof value.text === "string" && value.text.length <= MAX_TEXT
    && Number.isSafeInteger(value.revision) && (value.revision as number) >= 0;
}
function payloadValid(value: unknown, actor: MessageActor): value is MessagePayload {
  if (!object(value) || typeof value.body !== "string" || !value.body.trim() || value.body.length > MAX_TEXT) return false;
  // Existing first-party composers send these fields only. Unknown fields in
  // untrusted storage cannot become extra request author/attachment privileges.
  const allowed = actor.kind === "customer" ? ["body"] : ["body", "channel", "author_role", "kind", "is_internal"];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  return (value.channel === undefined || ["telegram", "web", "phone", "email", "sms", "internal"].includes(value.channel as string))
    && (value.author_role === undefined || value.author_role === "dispatcher")
    && (value.kind === undefined || ["text", "note", "announcement"].includes(value.kind as string))
    && (value.is_internal === undefined || typeof value.is_internal === "boolean");
}
function documentValid(value: unknown, actor: MessageActor): value is Document {
  if (!object(value) || !onlyKeys(value, ["version", "actor", "drafts", "intents"])
      || value.version !== 1 || !actorValid(value.actor) || !sameActor(value.actor, actor)
      || !object(value.drafts) || !Array.isArray(value.intents)
      || Object.keys(value.drafts).length > MAX_DRAFTS || value.intents.length > MAX_INTENTS) return false;
  for (const [key, draft] of Object.entries(value.drafts)) {
    const [conversation, mode, extra] = key.split(":");
    if (extra !== undefined || !UUID.test(conversation) || !MODES.includes(mode) || !draftValid(draft)) return false;
  }
  const keys = new Set<string>();
  for (const intent of value.intents) {
    if (!object(intent) || !onlyKeys(intent, ["version", "key", "actor", "conversation", "mode", "revision", "payload", "status"])
        || intent.version !== 1 || typeof intent.key !== "string" || !UUID.test(intent.key)
        || keys.has(intent.key.toLowerCase()) || !actorValid(intent.actor) || !sameActor(intent.actor, actor)
        || typeof intent.conversation !== "string" || !UUID.test(intent.conversation)
        || !MODES.includes(intent.mode as string) || !STATUSES.includes(intent.status as string)
        || !Number.isSafeInteger(intent.revision) || (intent.revision as number) < 0
        || !payloadValid(intent.payload, actor)) return false;
    keys.add(intent.key.toLowerCase());
  }
  return true;
}

export function purgeMessageIntents(storage: Storage): void {
  try {
    const owned: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) owned.push(key);
    }
    for (const key of owned) storage.removeItem(key);
  } catch { throw new MessageStorageError("unavailable"); }
}

/** A logout cookie outlives a failed cleanup and is shared with the server.
 * Mark it processed only after the entire owned purge succeeds. */
export function synchronizeMessageReset(storage: Storage): void {
  try {
    const epoch = requireMessageResetEpoch();
    if (storage.getItem(RESET) !== epoch) {
      purgeMessageIntents(storage);
      storage.setItem(RESET, epoch);
    }
  } catch (error) {
    if (error instanceof MessageStorageError) throw error;
    throw new MessageStorageError("unavailable");
  }
}

export async function logoutMessageSession(): Promise<void> {
  // Revoke pending verifications and hide all protected composers before await.
  revokeMessageSession();
  // Explicit logout must purge even if the cookie setter failed. Invalidating
  // the processed marker also prevents later confirmation from skipping cleanup.
  try { window.sessionStorage.removeItem(RESET); } catch { /* Continue all cleanup attempts. */ }
  try { purgeMessageIntents(window.sessionStorage); } catch { /* The persisted cookie marks cleanup required. */ }
  try { synchronizeMessageReset(window.sessionStorage); } catch { /* Never prevent server authentication cleanup. */ }
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Logout failed");
  completeMessageLogout();
}

/** Observe a freshly authenticated identity even when its thread GET is denied.
 * Thread readiness controls exposure/recovery separately from identity purge.
 */
export function confirmMessageActor(actor: MessageActor, storage: Storage): void {
  if (!actorValid(actor)) throw new MessageStorageError("identity");
  const key = PREFIX + [actor.center, actor.kind, actor.id].join(":");
  try {
    synchronizeMessageReset(storage);
    const previous = storage.getItem(ACTIVE);
    if (previous !== null && previous !== key) purgeMessageIntents(storage);
    storage.setItem(ACTIVE, key);
  } catch (error) {
    if (error instanceof MessageStorageError) throw error;
    throw new MessageStorageError("unavailable");
  }
}

export class MessageIntentStore {
  readonly actor: MessageActor;
  readonly storageKey: string;
  private readonly epoch: string;
  constructor(actor: MessageActor, private readonly storage: Storage) {
    if (!actorValid(actor)) throw new MessageStorageError("identity");
    this.actor = Object.freeze({ center: actor.center.toLowerCase(), kind: actor.kind, id: actor.id.toLowerCase() });
    this.storageKey = PREFIX + [this.actor.center, this.actor.kind, this.actor.id].join(":");
    try {
      // Constructor is invoked only after fresh authentication. A confirmed
      // different principal purges protected drafts, including old callbacks.
      confirmMessageActor(this.actor, storage);
      this.epoch = messageSessionEpoch();
      this.read();
    } catch (error) {
      if (error instanceof MessageStorageError) throw error;
      throw new MessageStorageError("unavailable");
    }
  }

  private read(): Document {
    try {
      if (this.epoch !== messageSessionEpoch()) throw new MessageStorageError("identity");
      if (this.storage.getItem(ACTIVE) !== this.storageKey) throw new MessageStorageError("identity");
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return { version: 1, actor: this.actor, drafts: {}, intents: [] };
      if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new MessageStorageError("full");
      const value: unknown = JSON.parse(raw);
      if (!documentValid(value, this.actor)) throw new MessageStorageError("invalid");
      return value;
    } catch (error) {
      if (error instanceof MessageStorageError) throw error;
      throw new MessageStorageError("invalid");
    }
  }

  private save(value: Document): void {
    if (this.epoch !== messageSessionEpoch()) throw new MessageStorageError("identity");
    if (!documentValid(value, this.actor)) throw new MessageStorageError("full");
    const raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new MessageStorageError("full");
    try {
      if (this.storage.getItem(ACTIVE) !== this.storageKey) throw new MessageStorageError("identity");
      this.storage.setItem(this.storageKey, raw);
    } catch (error) {
      if (error instanceof MessageStorageError) throw error;
      throw new MessageStorageError("unavailable");
    }
  }

  draft(conversation: string, mode: MessageMode): MessageDraft {
    return this.read().drafts[`${conversation}:${mode}`] ?? { text: "", revision: 0 };
  }
  edit(conversation: string, mode: MessageMode, text: string): MessageDraft {
    const value = this.read(), key = `${conversation}:${mode}`;
    const next = { text, revision: (value.drafts[key]?.revision ?? 0) + 1 };
    value.drafts[key] = next;
    this.save(value);
    return next;
  }
  unresolved(conversation: string): MessageIntent[] {
    // A stored pending record survives reload as uncertain; never auto-dispatch.
    return this.read().intents.filter(intent => intent.conversation === conversation)
      .map(intent => Object.freeze({ ...intent, actor: this.actor, payload: Object.freeze({ ...intent.payload }),
        status: intent.status === "pending" ? "uncertain" : intent.status }));
  }
  capture(conversation: string, mode: MessageMode, payload: MessagePayload): MessageIntent {
    const value = this.read(), draft = value.drafts[`${conversation}:${mode}`];
    if (value.intents.some(intent => intent.conversation === conversation)) throw new MessageStorageError("invalid");
    if (!draft || draft.text !== payload.body || !payloadValid(payload, this.actor)) throw new MessageStorageError("invalid");
    const intent: MessageIntent = {
      version: 1, key: crypto.randomUUID(), actor: this.actor, conversation, mode,
      revision: draft.revision, payload: Object.freeze({ ...payload }), status: "pending",
    };
    value.intents.push(intent);
    this.save(value); // Failure throws before a caller is allowed to POST.
    return Object.freeze(intent);
  }
  status(key: string, status: IntentStatus): void {
    const value = this.read();
    value.intents = value.intents.map(intent => intent.key === key ? { ...intent, status } : intent);
    this.save(value);
  }
  acknowledge(key: string): void {
    // Re-read storage rather than writing a captured document: another mounted
    // surface/newer draft can change while the old POST is pending.
    const value = this.read(), intent = value.intents.find(item => item.key === key);
    if (!intent) return;
    const draftKey = `${intent.conversation}:${intent.mode}`, draft = value.drafts[draftKey];
    if (draft?.revision === intent.revision && draft.text === intent.payload.body) {
      value.drafts[draftKey] = { text: "", revision: draft.revision + 1 };
    }
    value.intents = value.intents.filter(item => item.key !== key);
    // Empty acknowledged drafts contain nothing to recover; prune them without
    // discarding any unresolved receipt or newer nonempty draft.
    for (const [draftKey, draft] of Object.entries(value.drafts)) {
      if (!draft.text && !value.intents.some(item => `${item.conversation}:${item.mode}` === draftKey)) delete value.drafts[draftKey];
    }
    this.save(value);
  }
  resolve(key: string): void {
    // A deliberate resolution of a known rejection/conflict retires only the
    // receipt. It neither acknowledges its text nor dispatches a replacement.
    const value = this.read(), intent = value.intents.find(item => item.key === key);
    if (!intent) return;
    if (intent.status !== "rejected" && intent.status !== "conflict") throw new MessageStorageError("invalid");
    value.intents = value.intents.filter(item => item.key !== key);
    this.save(value);
  }
}
