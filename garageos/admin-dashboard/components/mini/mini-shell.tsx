"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, WifiOff } from "lucide-react";

import { ensureSession } from "@/lib/mini/client";
import { telegram } from "@/lib/mini/telegram";
import { useOnline } from "@/lib/mini/hooks";
import { TabBar } from "@/components/mini/tab-bar";

// The Mini App chrome: authenticates the customer session once, then renders the
// scrolling content + a persistent bottom tab bar. Telegram's own header sits
// above this webview, so we don't draw one.
export function MiniShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const online = useOnline();

  useEffect(() => {
    const wa = telegram();
    wa?.ready?.();
    wa?.expand?.();
    ensureSession()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-50 text-slate-400">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-8">
        <div className="max-w-xs text-center">
          <AlertCircle className="mx-auto size-9 text-slate-300" />
          <h1 className="mt-3 text-lg font-semibold text-slate-800">Couldn&apos;t sign you in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Open this app from your garage&apos;s Telegram bot, or make sure your account is linked.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white motion-safe:active:scale-95"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-slate-50">
      {!online ? (
        <div
          className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-slate-900 py-2 text-xs font-medium text-white"
          role="status"
        >
          <WifiOff className="size-3.5" /> You&apos;re offline
        </div>
      ) : null}
      <main className="px-4 pb-28 pt-4">{children}</main>
      <TabBar />
    </div>
  );
}
