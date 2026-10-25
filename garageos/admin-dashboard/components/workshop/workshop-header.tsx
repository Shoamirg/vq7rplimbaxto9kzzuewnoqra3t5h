"use client";

import { Wrench, LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutMessageSession } from "@/lib/message-intents";
import { authTransitionFailureKey, captureAuthOwnership } from "@/lib/auth-transition";

import { useI18n } from "@/lib/i18n/context";

function initials(name: string): string {
  return (
    name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"
  );
}

// Sticky top bar for the Mechanic App. Deliberately minimal — brand, the app
// name, who's signed in, and a way out. No advisor navigation.
export function WorkshopHeader({ mechanicName, garageName, authFingerprint }: { mechanicName: string; garageName: string; authFingerprint: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [owner] = useState(captureAuthOwnership);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  async function signOut() {
    setLogoutError(null);
    try {
      await logoutMessageSession(destination => { router.replace(destination); router.refresh(); }, owner, authFingerprint);
    } catch (error) { setLogoutError(authTransitionFailureKey(error)); }
  }
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Wrench className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-foreground">{t("workshop.title")}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{garageName}</p>
        </div>
        <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground" title={mechanicName}>
          {initials(mechanicName)}
        </div>
        <button
          onClick={() => void signOut()}
          aria-label={t("workshop.sign_out")}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
      {logoutError && <p role="alert" className="px-4 pb-3 text-sm">{t(logoutError)}</p>}
    </header>
  );
}
