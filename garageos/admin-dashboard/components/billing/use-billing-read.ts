"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientFetch } from "@/lib/api/client";
import type { MessageActor } from "@/lib/message-intents";
import { verifyStaffMessageActor } from "@/lib/use-staff-message-session";
import { accessFailure } from "../operations/use-operation-read";

/** Each result belongs to a freshly verified actor and exact document/query.
 * A departed request can finish normally but cannot paint or revoke a new one.
 */
export function useBillingRead<T>(key: string | null, path: string | null,
  actor: MessageActor | null, onDenied: (error: unknown) => void) {
  const [result, setResult] = useState<{ key: string | null; actor: MessageActor | null;
    data: T | null; error: unknown; loading: boolean }>({ key: null, actor: null, data: null, error: null, loading: false });
  const latest = useRef({ key, path, actor, onDenied });
  latest.current = { key, path, actor, onDenied };
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async (): Promise<T | null> => {
    const target = latest.current;
    if (!target.key || !target.path || !target.actor) return null;
    const version = ++sequence.current;
    const current = () => version === sequence.current && target.key === latest.current.key
      && target.actor === latest.current.actor;
    setResult(old => ({ key: target.key, actor: target.actor,
      data: old.key === target.key && old.actor === target.actor ? old.data : null, error: null, loading: true }));
    try {
      await verifyStaffMessageActor(current, target.actor);
      if (!current()) return null;
      const data = await clientFetch<T>(target.path, { cache: "no-store" });
      if (!current()) return null;
      await verifyStaffMessageActor(current, target.actor);
      if (!current()) return null;
      setResult({ key: target.key, actor: target.actor, data, error: null, loading: false });
      return data;
    } catch (error) {
      if (!current()) return null;
      if (accessFailure(error)) {
        setResult({ key: target.key, actor: target.actor, data: null, error, loading: false });
        latest.current.onDenied(error);
      } else setResult(old => ({ key: target.key, actor: target.actor,
        data: old.key === target.key && old.actor === target.actor ? old.data : null, error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => {
    invalidate();
    if (key && path && actor) void refresh();
    return invalidate;
  }, [key, path, actor, invalidate, refresh]);
  const matches = !!actor && key !== null && result.key === key && result.actor === actor;
  return { data: matches ? result.data : null, error: matches ? result.error : null,
    loading: !!key && !!actor && (!matches || result.loading), refresh, invalidate };
}
