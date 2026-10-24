"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";

import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/i18n/format";

// Shared visual primitives for the Mini App. Kept self-contained (its own
// tokens) so the customer surface reads as an intentional, branded product —
// not a recoloured admin screen.

export function money(n: number, locale: Locale = "en"): string {
  return formatMoney(locale, n, "USD");
}

const BAND_COLOR: Record<string, string> = {
  excellent: "var(--status-success)",
  good: "var(--color-foreground)",
  fair: "var(--status-warning)",
  poor: "var(--status-danger)",
};

export function bandColor(band: string): string {
  return BAND_COLOR[band] ?? "var(--color-muted-foreground)";
}

const CARD_BASE =
  "block rounded-bento bg-card p-[18px] shadow-bento border border-white/65 dark:border-border";
const TAPPABLE =
  " transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50";

export function Card({
  children,
  className = "",
  href,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const cls = `${CARD_BASE} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls + TAPPABLE} aria-label={ariaLabel} onClick={() => haptic("light")}>
        {children}
      </Link>
    );
  }
  return (
    <div className={cls + (onClick ? TAPPABLE : "")} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-1 pb-3 pt-1">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
      {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}

// A compact SVG health ring (score 0-100) coloured by band.
export function HealthRing({ score, band, size = 56 }: { score: number; band: string; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = bandColor(band);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute text-sm font-bold text-foreground">{Math.round(score)}</span>
    </div>
  );
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-muted text-muted-foreground",
    blue: "bg-primary-50 text-primary-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

// ── Skeletons (layout-mirroring, motion-safe) ───────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse rounded-2xl bg-slate-200/70 ${className}`} aria-hidden />;
}

/** Generic list-of-cards skeleton (vehicles, messages, receipts). */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-3xl bg-card p-4 ring-1 ring-slate-900/4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Home skeleton: greeting + SOS + a card. */
export function HomeSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2 px-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-20 w-full rounded-3xl" />
      <ListSkeleton rows={2} />
    </div>
  );
}

// Kept for backwards-compat; screens should prefer a tailored skeleton.
export function Loading() {
  return <ListSkeleton rows={3} />;
}

export function EmptyState({ icon, title, note }: { icon?: ReactNode; title: string; note?: string }) {
  return (
    <div className="grid place-items-center rounded-3xl bg-card/80 px-6 py-10 text-center ring-1 ring-slate-900/4">
      {icon ? <div className="mb-2 text-slate-300">{icon}</div> : null}
      <p className="font-medium text-foreground">{title}</p>
      {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** One consistent error state with a Retry, used by every screen. */
export function ScreenError({
  message,
  onRetry,
  offline = false,
}: {
  message?: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid place-items-center rounded-3xl bg-card/80 px-6 py-12 text-center ring-1 ring-slate-900/4" role="alert">
      {offline ? <WifiOff className="mb-2 size-8 text-slate-300" /> : null}
      <p className="font-medium text-foreground">{offline ? t("mini.offline") : (message ?? t("mini.error_generic"))}</p>
      <p className="mt-1 text-sm text-muted-foreground">{offline ? t("mini.offline_hint") : t("mini.error_hint")}</p>
      {onRetry ? (
        <button
          onClick={() => {
            haptic("medium");
            onRetry();
          }}
          className="mt-5 min-h-[44px] rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition motion-safe:active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          {t("mini.retry")}
        </button>
      ) : null}
    </div>
  );
}
