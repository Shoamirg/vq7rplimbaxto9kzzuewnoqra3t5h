"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, WifiOff } from "lucide-react";

import { ensureSession } from "@/lib/mini/client";
import { telegram, telegramLocale } from "@/lib/mini/telegram";
import { useOnline } from "@/lib/mini/hooks";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_COOKIE } from "@/lib/i18n/dictionaries";
import { TabBar } from "@/components/mini/tab-bar";
import { LogoMark, LogoTile } from "@/components/brand/logo";

function hasLocaleCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
}

// The Mini App chrome: authenticates the customer session once, then renders the
// scrolling content + a persistent bottom tab bar. Telegram's own header sits
// above this webview, so we don't draw one.
export function MiniShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const online = useOnline();
  const { t, dir, setLocale } = useI18n();

  useEffect(() => {
    const wa = telegram();
    wa?.ready?.();
    wa?.expand?.();
    // Auto-adopt the customer's Telegram language on first visit, unless they've
    // already chosen a language (cookie present, which wins).
    if (!hasLocaleCookie()) {
      const tg = telegramLocale();
      if (tg) setLocale(tg);
    }
    ensureSession()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, [setLocale]);

  if (state === "loading") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-950" dir={dir}>
        <div className="flex flex-col items-center gap-4">
          <LogoTile size={84} />
          <div className="text-center">
            <p className="font-brand text-xl font-extrabold tracking-tight text-white">GarageOS</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">Vehicle Intelligence</p>
          </div>
          <Loader2 className="mt-1 size-5 animate-spin text-slate-600" />
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-8" dir={dir}>
        <div className="max-w-xs text-center">
          <LogoMark size={40} className="mx-auto mb-3" />
          <AlertCircle className="mx-auto size-9 text-slate-300" />
          <h1 className="mt-3 text-lg font-semibold text-slate-800">{t("mini.signin_failed")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("mini.signin_hint")}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 min-h-[44px] rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            {t("mini.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-slate-50" dir={dir}>
      {!online ? (
        <div
          className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-slate-900 py-2 text-xs font-medium text-white"
          role="status"
        >
          <WifiOff className="size-3.5" /> {t("mini.offline")}
        </div>
      ) : null}
      <main className="px-4 pb-28 pt-4">{children}</main>
      <TabBar />
    </div>
  );
}
