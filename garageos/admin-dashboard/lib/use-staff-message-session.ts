"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientFetch, ClientApiError } from "./api/client";
import type { CurrentUser } from "./api/types";
import { confirmMessageActor, synchronizeMessageReset } from "./message-intents";
import { MESSAGE_LOGOUT_EVENT, messageSessionEpoch } from "./message-reset";
import type { MessageActor } from "./message-intents";

const sameActor = (a: MessageActor, b: MessageActor) => a.id === b.id && a.center === b.center && a.kind === b.kind;
let observedActor: MessageActor | null = null, actorGeneration = 0;

/** Fresh authenticated identity is independent of a particular thread read.
 * In particular, a changed actor must purge old receipts even if the new actor
 * cannot open the previously selected conversation.
 */
export async function verifyStaffMessageActor(isCurrent: () => boolean, expected?: MessageActor) {
  synchronizeMessageReset(window.sessionStorage);
  const epoch = messageSessionEpoch();
  const generation = actorGeneration;
  const user = await clientFetch<CurrentUser>("/auth/me", { cache: "no-store" });
  // A completed newer identity observation or a departed read generation owns
  // protected storage. An obsolete response has no authority to purge it.
  if (!isCurrent() || generation !== actorGeneration || epoch !== messageSessionEpoch()) throw new ClientApiError("Identity verification superseded", 401);
  const actor: MessageActor = { kind: "staff", id: user.id.toLowerCase(), center: user.service_center_id.toLowerCase() };
  confirmMessageActor(actor, window.sessionStorage);
  if (!observedActor || !sameActor(observedActor, actor)) { observedActor = actor; actorGeneration++; }
  if (expected && !sameActor(actor, expected)) throw new ClientApiError("Message actor changed", 401);
  if (!user.permissions?.includes("staff.read")) throw new ClientApiError("Staff access unavailable", 403);
  return { actor, canWrite: user.permissions.includes("staff.write") };
}

export function useStaffMessageSession() {
  const [session, setSession] = useState<{ actor: MessageActor | null; canWrite: boolean; error: unknown }>({ actor: null, canWrite: false, error: null });
  const authorized = useRef(false), sequence = useRef(0);
  const suspend = useCallback(() => { authorized.current = false; }, []);
  const verify = useCallback(async () => {
    const version = ++sequence.current;
    authorized.current = false;
    setSession(old => ({ ...old, actor: null, canWrite: false, error: null }));
    try {
      const fresh = await verifyStaffMessageActor(() => version === sequence.current);
      if (version !== sequence.current) return null;
      authorized.current = true; setSession({ ...fresh, error: null }); return fresh;
    } catch (error) {
      if (version === sequence.current) setSession({ actor: null, canWrite: false, error });
      return null;
    }
  }, []);
  // Unmount cancels an unfinished identity read, not the verified authorization
  // of a captured write. A late ACK may retire storage without painting UI.
  useEffect(() => {
    const logout = () => {
      sequence.current++; actorGeneration++; observedActor = null; authorized.current = false;
      setSession({ actor: null, canWrite: false, error: new ClientApiError("Session signed out", 401) });
    };
    window.addEventListener(MESSAGE_LOGOUT_EVENT, logout);
    void verify();
    return () => { sequence.current++; window.removeEventListener(MESSAGE_LOGOUT_EVENT, logout); };
  }, [verify]);
  return { ...session, verify, suspend, isAuthorized: () => authorized.current };
}
