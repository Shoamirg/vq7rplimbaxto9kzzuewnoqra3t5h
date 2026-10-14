"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, LifeBuoy, Check } from "lucide-react";
import { Button } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

// A contextual error state — never a bare "Something went wrong." It names what
// failed, offers the likely fix (retry), and gives escape hatches (check the
// connection, report the issue). Used by route error.tsx boundaries.
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  async function checkConnection() {
    setChecking(true);
    setOnline(null);
    try {
      // A cheap same-origin ping; navigator.onLine as the fallback signal.
      await fetch("/login", { method: "HEAD", cache: "no-store" });
      setOnline(true);
    } catch {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : false);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={cn("grid min-h-[60vh] place-items-center p-6", className)}>
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {onRetry && (
            <Button size="sm" leftIcon={<RefreshCw className="size-4" />} onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            leftIcon={
              online === true ? <Check className="size-4" /> : <Wifi className="size-4" />
            }
            loading={checking}
            onClick={checkConnection}
          >
            {t(online === null ? "common.check_connection" : online ? "common.connection_ok" : "common.offline")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<LifeBuoy className="size-4" />}
            onClick={() => window.open("mailto:support@garageos.app?subject=GarageOS%20issue", "_blank")}
          >
            {t("common.report_issue")}
          </Button>
        </div>

        {online === false && (
          <p className="text-xs text-danger">
            {t("common.offline_hint")}
          </p>
        )}
      </div>
    </div>
  );
}
