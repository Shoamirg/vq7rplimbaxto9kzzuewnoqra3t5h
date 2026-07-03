"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";

import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";

// Shared visual primitives for the Mini App. Kept self-contained (its own
// tokens) so the customer surface reads as an intentional, branded product —
// not a recoloured admin screen.

export function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

const BAND_COLOR: Record<string, string> = {
  excellent: "#16a34a",
  good: "#2563eb",
  fair: "#d97706",
  poor: "#dc2626",
};

export function bandColor(band: string): string {
  return BAND_COLOR[band] ?? "#64748b";
}

const CARD_BASE =
  "block rounded-3xl bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04]";
const TAPPABLE =
  " transition motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50";

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
    <div className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </div>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-1 pb-3 pt-1">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
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
      <span className="absolute text-sm font-bold text-slate-900">{Math.round(score)}</span>
    </div>
  );
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-700",
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
        <div key={i} className="flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-slate-900/[0.04]">
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
    <div className="grid place-items-center rounded-3xl bg-white/60 px-6 py-10 text-center ring-1 ring-slate-900/[0.04]">
      {icon ? <div className="mb-2 text-slate-300">{icon}</div> : null}
      <p className="font-medium text-slate-700">{title}</p>
      {note ? <p className="mt-1 text-sm text-slate-400">{note}</p> : null}
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
    <div className="grid place-items-center rounded-3xl bg-white/60 px-6 py-12 text-center ring-1 ring-slate-900/[0.04]" role="alert">
      {offline ? <WifiOff className="mb-2 size-8 text-slate-300" /> : null}
      <p className="font-medium text-slate-700">{offline ? t("mini.offline") : (message ?? t("mini.error_generic"))}</p>
      <p className="mt-1 text-sm text-slate-400">{offline ? t("mini.offline_hint") : t("mini.error_hint")}</p>
      {onRetry ? (
        <button
          onClick={() => {
            haptic("medium");
            onRetry();
          }}
          className="mt-5 min-h-[44px] rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          {t("mini.retry")}
        </button>
      ) : null}
    </div>
  );
}
