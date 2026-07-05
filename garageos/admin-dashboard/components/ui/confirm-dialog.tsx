"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@garageos/design-system";

import { useI18n } from "@/lib/i18n/context";

// Reusable confirmation dialog (portaled to body so it escapes any transformed
// ancestor). Controlled: the parent renders it when a destructive action is armed.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div role="alertdialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6">
        <div className="flex items-start gap-3">
          {danger && (
            <div className="shrink-0 size-10 rounded-full grid place-items-center bg-red-50 text-red-600">
              <AlertTriangle className="size-5" />
            </div>
          )}
          <div>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={go}
            disabled={busy}
            leftIcon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
          >
            {busy ? t("common.working") : (confirmLabel ?? t("common.delete"))}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
