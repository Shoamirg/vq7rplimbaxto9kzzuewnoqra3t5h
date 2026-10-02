"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/api/client";

type Page = { total: number; has_more: boolean };
export function usePagedList<T extends Page>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!query && !offset && !refresh) { setData(initial); setLoading(false); setError(false); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(false);
    const timer = setTimeout(() => {
      clientFetch<T>(`${path}?q=${encodeURIComponent(query.trim())}&offset=${offset}&limit=50`, { signal: controller.signal })
        .then((result) => { if (active) setData(result); })
        .catch(() => { if (active) setError(true); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [initial, path, query, offset, refresh]);
  return { data, query, offset, loading, error,
    search: (value: string) => { setQuery(value); setOffset(0); },
    previous: () => setOffset((n) => Math.max(0, n - 50)),
    next: () => setOffset((n) => n + 50),
    reload: () => setRefresh((n) => n + 1),
  };
}
