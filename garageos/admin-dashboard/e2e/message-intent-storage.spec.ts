// Controller/storage contract only. These do not replace the actual API/BFF
// production-browser recovery flows required by#38.
import { expect, test } from "@playwright/test";
import { MessageIntentStore, MessageStorageError, purgeMessageIntents } from "../lib/message-intents";
import type { MessageActor } from "../lib/message-intents";

class TabStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("Private QA storage unavailable");
    this.values.set(key, value);
  }
}
const actor: MessageActor = { center: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", kind: "staff", id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
const conversation = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const otherConversation = "dddddddd-dddd-dddd-dddd-dddddddddddd";

test("capture/reload freezes exact content and keeps the original deliberate recovery key", () => {
  const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
  const body = "  Exact whitespace\nYangi xabar  ";
  store.edit(conversation, "reply", body);
  const intent = store.capture(conversation, "reply", { body, channel: "web", kind: "text", is_internal: false });
  expect(intent.status).toBe("pending");
  const restored = new MessageIntentStore(actor, storage).unresolved(conversation)[0];
  expect(restored.status).toBe("uncertain");
  expect(restored.key).toBe(intent.key);
  expect(restored.payload.body).toBe(body);
  expect(Object.isFrozen(restored)).toBe(true);
  expect(Object.isFrozen(restored.payload)).toBe(true);
  expect(() => store.capture(conversation, "reply", { body })).toThrow(MessageStorageError);
  expect(store.unresolved(conversation)[0].key).toBe(intent.key);
});

test("acknowledgement preserves a newer draft and another conversation/mode", () => {
  const storage = new TabStorage(), first = new MessageIntentStore(actor, storage);
  first.edit(conversation, "reply", "Original");
  const intent = first.capture(conversation, "reply", { body: "Original" });
  // A second surface mounted while the captured write was outstanding.
  const newer = new MessageIntentStore(actor, storage);
  newer.edit(conversation, "reply", "Newer exact draft");
  newer.edit(conversation, "note", "Internal draft");
  newer.edit(otherConversation, "reply", "Other recipient");
  first.acknowledge(intent.key);
  expect(newer.draft(conversation, "reply").text).toBe("Newer exact draft");
  expect(newer.draft(conversation, "note").text).toBe("Internal draft");
  expect(newer.draft(otherConversation, "reply").text).toBe("Other recipient");
  expect(newer.unresolved(conversation)).toEqual([]);
});

test("intentional identical text after acknowledgement has a new UUID", () => {
  const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
  store.edit(conversation, "reply", "Same text");
  const first = store.capture(conversation, "reply", { body: "Same text" });
  store.acknowledge(first.key);
  expect(store.draft(conversation, "reply").text).toBe("");
  store.edit(conversation, "reply", "Same text");
  const second = store.capture(conversation, "reply", { body: "Same text" });
  expect(second.key).not.toBe(first.key);
  // A duplicated old completion cannot clear the newly captured revision.
  store.acknowledge(first.key);
  expect(store.draft(conversation, "reply").text).toBe("Same text");
});

test("temporary suspension retains the actor receipt; logout purges it", () => {
  const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
  storage.setItem("unrelated-preference", "kept");
  store.edit(conversation, "reply", "Unresolved");
  const intent = store.capture(conversation, "reply", { body: "Unresolved" });
  store.status(intent.key, "suspended");
  const sameActor = new MessageIntentStore(actor, storage);
  expect(sameActor.unresolved(conversation)[0]).toMatchObject({ key: intent.key, status: "suspended", payload: { body: "Unresolved" } });
  purgeMessageIntents(storage);
  expect(() => store.acknowledge(intent.key)).toThrow(MessageStorageError);
  expect(storage.getItem("unrelated-preference")).toBe("kept");
  expect(new MessageIntentStore(actor, storage).unresolved(conversation)).toEqual([]);
});

test("confirmed identity change hides/purges old records and rejects late callbacks", () => {
  const storage = new TabStorage(), first = new MessageIntentStore(actor, storage);
  first.edit(conversation, "reply", "Protected draft");
  const intent = first.capture(conversation, "reply", { body: "Protected draft" });
  const second = new MessageIntentStore({ ...actor, kind: "customer" }, storage);
  expect(second.unresolved(conversation)).toEqual([]);
  expect(second.draft(conversation, "reply").text).toBe("");
  expect(storage.getItem(first.storageKey)).toBeNull();
  expect(() => first.status(intent.key, "uncertain")).toThrow(MessageStorageError);
  expect(storage.getItem(first.storageKey)).toBeNull();
});

test("storage failure occurs before a submission can be returned for dispatch", () => {
  const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
  store.edit(conversation, "reply", "Retained draft");
  storage.failWrites = true;
  expect(() => store.capture(conversation, "reply", { body: "Retained draft" })).toThrow(MessageStorageError);
  expect(store.unresolved(conversation)).toEqual([]);
  expect(store.draft(conversation, "reply").text).toBe("Retained draft");
});

for (const status of ["rejected", "conflict"] as const) {
  test(`explicit ${status} resolution retains exact drafts and permits a later deliberate submission`, () => {
    const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
    store.edit(conversation, "reply", "  Rejected exact draft\n  ");
    const intent = store.capture(conversation, "reply", { body: "  Rejected exact draft\n  " });
    store.status(intent.key, status);
    store.edit(conversation, "note", "Other mode");
    const originalDraft = store.draft(conversation, "reply");
    store.resolve(intent.key);
    expect(store.unresolved(conversation)).toEqual([]);
    expect(store.draft(conversation, "reply")).toEqual(originalDraft);
    expect(store.draft(conversation, "note").text).toBe("Other mode");
    const next = store.capture(conversation, "reply", { body: originalDraft.text });
    expect(next.key).not.toBe(intent.key);
  });
}

for (const status of ["pending", "uncertain", "suspended"] as const) {
  test(`cannot retire a ${status} receipt whose outcome still needs recovery`, () => {
    const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
    store.edit(conversation, "reply", "Protected uncertain draft");
    const intent = store.capture(conversation, "reply", { body: "Protected uncertain draft" });
    store.status(intent.key, status);
    const before = storage.getItem(store.storageKey);
    expect(() => store.resolve(intent.key)).toThrow(MessageStorageError);
    expect(storage.getItem(store.storageKey)).toBe(before);
  });
}

test("resolution after an edit or old duplicate callback never clears the latest draft or receipt", () => {
  const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
  store.edit(conversation, "reply", "Original rejected");
  const original = store.capture(conversation, "reply", { body: "Original rejected" });
  store.status(original.key, "rejected");
  store.edit(conversation, "reply", "Newer exact draft");
  store.resolve(original.key);
  expect(store.draft(conversation, "reply").text).toBe("Newer exact draft");
  const next = store.capture(conversation, "reply", { body: "Newer exact draft" });
  store.resolve(original.key);
  expect(store.unresolved(conversation)[0].key).toBe(next.key);
  expect(store.draft(conversation, "reply").text).toBe("Newer exact draft");
});

for (const invalid of ["json", "version", "actor", "uuid", "uppercase", "payload", "duplicate", "size"]) {
  test(`untrusted ${invalid} storage is rejected and preserved for explicit resolution`, () => {
    const storage = new TabStorage(), store = new MessageIntentStore(actor, storage);
    store.edit(conversation, "reply", "Protected unresolved");
    store.capture(conversation, "reply", { body: "Protected unresolved" });
    const value = JSON.parse(storage.getItem(store.storageKey)!) as {
      version: number; actor: MessageActor; drafts: Record<string, { text: string; revision: number }>;
      intents: { key: string; conversation: string; actor: MessageActor; payload: Record<string, unknown> }[];
    };
    if (invalid === "version") value.version = 0;
    if (invalid === "actor") value.intents[0].actor.id = otherConversation;
    if (invalid === "uuid") value.intents[0].key = "not-a-uuid";
    if (invalid === "uppercase") value.intents[0].conversation = conversation.toUpperCase();
    if (invalid === "payload") value.intents[0].payload.author_user_id = otherConversation;
    if (invalid === "duplicate") value.intents.push(value.intents[0]);
    if (invalid === "size") value.drafts[`${conversation}:reply`].text = "x".repeat(64 * 1024 + 1);
    const raw = invalid === "json" ? "{invalid" : JSON.stringify(value);
    storage.setItem(store.storageKey, raw);
    expect(() => new MessageIntentStore(actor, storage)).toThrow(MessageStorageError);
    expect(storage.getItem(store.storageKey)).toBe(raw);
  });
}
