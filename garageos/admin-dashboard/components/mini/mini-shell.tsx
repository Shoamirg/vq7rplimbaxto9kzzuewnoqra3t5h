"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, WifiOff } from "lucide-react";

import { ensureSession } from "@/lib/mini/client";
import { MessageStorageError } from "@/lib/message-intents";
import { telegram } from "@/lib/mini/telegram";
import { useOnline } from "@/lib/mini/hooks";
import { useI18n } from "@/lib/i18n/context";
import { TabBar } from "@/components/mini/tab-bar";
import { LogoMark, LogoTile } from "@/components/brand/logo";


// The Mini App chrome: authenticates the customer session once, then renders the
// scrolling content + a persistent bottom tab bar. Telegram's own header sits
// above this webview, so we don't draw one.
export function MiniShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error" | "storage">("loading");
  const verification = useRef(0);
  const online = useOnline();
  const { t, dir } = useI18n();
  const verifySession = useCallback(() => {
    const version = ++verification.current;
    setState("loading");
    void ensureSession()
      .then(() => { if (version === verification.current) setState("ready"); })
      .catch(error => { if (version === verification.current) setState(error instanceof MessageStorageError ? "storage" : "error"); });
  }, []);

  useEffect(() => {
    const wa = telegram();
    wa?.ready?.();
    wa?.expand?.();
    // Uzbek is the default for everyone; a customer's own choice (cookie) is kept.
    verifySession();
    return () => { verification.current++; };
  }, [verifySession]);

  if (state === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950" dir={dir}>
        <div className="flex flex-col items-center gap-4">
          <LogoTile size={84} />
          <div className="text-center">
            <p className="font-brand text-xl font-extrabold tracking-tight text-white">GarageOS</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vehicle Intelligence</p>
          </div>
          <Loader2 className="mt-1 size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (state === "error" || state === "storage") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-8" dir={dir}>
        <div className="max-w-xs text-center">
          <LogoMark size={40} className="mx-auto mb-3" />
          <AlertCircle className="mx-auto size-9 text-slate-300" />
          {state === "storage" ? <p role="alert" className="mt-3 text-sm text-foreground">{t("message.storage")}</p> : <>
            <h1 className="mt-3 text-lg font-semibold text-foreground">{t("mini.signin_failed")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("mini.signin_hint")}</p>
          </>}
          <button
            onClick={() => state === "storage" ? verifySession() : window.location.reload()}
            className="mt-5 min-h-[44px] rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition motion-safe:active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            {t(state === "storage" ? "message.storage_retry" : "mini.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-background" dir={dir}>
      {!online ? (
        <div
          className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-slate-900 py-2 text-xs font-medium text-white"
          role="status"
        >
          <WifiOff className="size-3.5" /> {t("mini.offline")}
        </div>
      ) : null}
      <main className="px-5 pb-28 pt-5">{children}</main>
      <TabBar />
    </div>
  );
}
