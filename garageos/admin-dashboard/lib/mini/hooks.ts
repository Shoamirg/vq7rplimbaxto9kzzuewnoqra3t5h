"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { miniFetch } from "@/lib/mini/client";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
}

/**
 * One place for the loading / error / retry lifecycle every screen shares, so
 * the states look and behave identically across the Mini App. `setData` lets a
 * screen apply optimistic local mutations (e.g. an approved estimate).
 */
export function useMiniData<T>(path: string) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: false });

  const load = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    miniFetch<T>(path)
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState((s) => ({ ...s, loading: false, error: true })));
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => load(), [load]);

  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload: load, setData };
}

/** True when the browser reports an online connection. SSR-safe. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
