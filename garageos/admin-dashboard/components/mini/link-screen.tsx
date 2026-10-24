"use client";

import { useState } from "react";
import { Loader2, Link2 } from "lucide-react";

import { telegram } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import { LogoMark } from "@/components/brand/logo";

// Shown when a Telegram user opens the Mini App but isn't linked to any customer
// yet. They enter the phone their garage has on file; the backend matches the
// customer, stamps their telegram_id, and we're in.
export function LinkScreen({ onLinked }: { onLinked: () => void }) {
  const { t, dir } = useI18n();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phone.trim().length < 5) {
      setError(t("mini.link.need_phone"));
      return;
    }
    setBusy(true);
    try {
      const initData = telegram()?.initData ?? "";
      const res = await fetch("/api/mini/auth/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData, phone: phone.trim() }),
      });
      if (res.status === 404) {
        setError(t("mini.link.not_found"));
        return;
      }
      if (!res.ok) {
        setError(t("mini.link.error"));
        return;
      }
      onLinked();
    } catch {
      setError(t("mini.link.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6" dir={dir}>
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <LogoMark size={40} className="mx-auto mb-3" />
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-600">
          <Link2 className="size-6" />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-slate-800">{t("mini.link.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("mini.link.hint")}</p>

        <label className="sr-only" htmlFor="link-phone">{t("mini.link.phone")}</label>
        <input
          id="link-phone"
          type="tel"
          inputMode="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("mini.link.phone_ph")}
          className="mt-5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-center text-base tracking-wide text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition disabled:opacity-60 motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? t("mini.link.linking") : t("mini.link.submit")}
        </button>
      </form>
    </div>
  );
}
