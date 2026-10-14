"use client";

import { useState } from "react";
import { Printer, Share2, Check, ArrowLeft } from "lucide-react";
import { Button } from "@garageos/design-system";
import { translate, type Locale } from "@/lib/i18n/dictionaries";

// Public-facing action bar for the passport document. Print/Save-PDF uses the
// browser's print pipeline for now; a server-rendered A4 PDF is Sprint 2.
export function PassportActions({ backHref, locale }: { backHref?: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title: translate(locale, "passport.title"), url };
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
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="size-4" />}>{translate(locale, "passport.back")}</Button>
        </a>
      )}
      <div className="pp-actions-spacer" />
      <Button
        variant="outline"
        size="sm"
        leftIcon={copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        onClick={share}
      >
        {copied ? translate(locale, "passport.link_copied") : translate(locale, "passport.share")}
      </Button>
      <Button size="sm" leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
        {translate(locale, "passport.print")}
      </Button>
    </div>
  );
}
