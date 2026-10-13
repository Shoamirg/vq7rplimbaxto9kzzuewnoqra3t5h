"use client";

import { useEffect } from "react";

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

function returnPath(): string {
  const candidate = new URLSearchParams(window.location.search).get("returnTo") ?? "/dashboard";
  return candidate.startsWith("/") && !candidate.startsWith("//") &&
    !candidate.includes("\\") && !candidate.startsWith("/api/")
    ? candidate
    : "/dashboard";
}

export default function SessionRefreshPage() {
  useEffect(() => {
    const target = returnPath();
    const refresh = async () => {
      const response = await fetch("/api/auth/refresh", { method: "POST" });
      return response.ok;
    };

    const run = async () => {
      try {
        const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
        const refreshed = locks
          ? await locks.request<boolean>("garageos-staff-refresh", refresh)
          : await refresh();
        if (refreshed) {
          window.location.replace(target);
        } else {
          window.location.replace(`/login?from=${encodeURIComponent(target)}`);
        }
      } catch {
        window.location.replace(`/login?from=${encodeURIComponent(target)}`);
      }
    };

    void run();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
      <p role="status" aria-live="polite">Refreshing your secure session…</p>
    </main>
  );
}
