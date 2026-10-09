"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientFetch, ClientApiError } from "@/lib/api/client";

export function accessFailure(error: unknown): boolean {
  return error instanceof ClientApiError && (error.status === 401 || (error.status === 403 && error.code !== "CASE_CONVERSATION_UNAVAILABLE"));
}
export function uncertainWrite(error: unknown): boolean {
  return !(error instanceof ClientApiError) || error.status >= 500;
}

// Results carry their identity, so render never exposes the old recipient/filter
// even before effect cleanup. Sequence checks also cover an abort racing a reply.
export function useOperationRead<T>(key: string | null, path: string | null, enabled: boolean,
  onDenied: (error: unknown) => void, poll = true) {
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: unknown; loading: boolean }>({ key: null, data: null, error: null, loading: false });
  const current = useRef({ key, path, enabled, onDenied });
  current.current = { key, path, enabled, onDenied };
  const seq = useRef(0), request = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    seq.current++; request.current?.abort(); request.current = null;
    // Cancelled completions have no authority to settle state. Settle their
    // loading here, retaining the last validated data and any read error.
    setResult(old => old.loading ? { ...old, loading: false } : old);
  }, []);
  const load = useCallback(async (force = true): Promise<T | null> => {
    const target = current.current;
    if (!target.key || !target.path || !target.enabled || (!force && request.current)) return null;
    invalidate(); const version = seq.current, controller = new AbortController(); request.current = controller;
    setResult(old => ({ key: target.key, data: old.key === target.key ? old.data : null, error: null, loading: true }));
    try {
      const data = await clientFetch<T>(target.path, { signal: controller.signal });
      if (controller.signal.aborted || version !== seq.current || target.key !== current.current.key || !current.current.enabled) return null;
      setResult({ key: target.key, data, error: null, loading: false }); return data;
    } catch (error) {
      if (controller.signal.aborted || version !== seq.current || target.key !== current.current.key || !current.current.enabled) return null;
      if (accessFailure(error)) { setResult({ key: target.key, data: null, error, loading: false }); current.current.onDenied(error); }
      else setResult(old => ({ key: target.key, data: old.key === target.key ? old.data : null, error, loading: false }));
      return null;
    } finally { if (request.current === controller) request.current = null; }
  }, [invalidate]);
  useEffect(() => {
    invalidate(); if (enabled && key && path) void load(); return invalidate;
  }, [key, path, enabled, invalidate, load]);
  useEffect(() => {
    if (!poll || !enabled || !key || !path) return;
    const timer = setInterval(() => void load(false), 8000); return () => clearInterval(timer);
  }, [poll, enabled, key, path, load]);
  const matches = key !== null && result.key === key;
  return { data: matches ? result.data : null, error: matches ? result.error : null,
    loading: !!key && (!matches || result.loading), refresh: load, invalidate };
}
