"use client";

import { useState } from "react";
import { Printer, Share2, Check, ArrowLeft } from "lucide-react";
import { Button } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";

// Public-facing action bar for the passport document. Print/Save-PDF uses the
// browser's print pipeline for now; a server-rendered A4 PDF is Sprint 2.
export function PassportActions({ backHref }: { backHref?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title: t("pass.share_title"), url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  return (
    <div className="pp-actions">
      {backHref && (
        <a href={backHref}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="size-4" />}>{t("pass.back")}</Button>
        </a>
      )}
      <div className="pp-actions-spacer" />
      <Button
        variant="outline"
        size="sm"
        leftIcon={copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        onClick={share}
      >
        {copied ? t("pass.link_copied") : t("pass.share")}
      </Button>
      <Button size="sm" leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
        {t("pass.print")}
      </Button>
    </div>
  );
}
