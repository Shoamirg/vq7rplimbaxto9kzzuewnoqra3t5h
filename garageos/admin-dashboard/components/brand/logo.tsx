import type { CSSProperties } from "react";

// GarageOS "Live G": a bold G ring whose open end carries an emerald status dot —
// the same "live" dot used for bookings, Telegram and job status. The ring uses
// `tone`, the dot uses `accent`; the dot is a stroked ring so its centre stays
// transparent on any surface.

export const BRAND_EMERALD = "#109868";
export const GARAGE_BLACK = "#111315";
export const GARAGE_WHITE = "#F5F6F8";

function MarkPaths({ tone, accent }: { tone: string; accent: string }) {
  return (
    <>
      <path
        d="M46.5 21.5 A17 17 0 1 0 49 36 H35"
        fill="none"
        stroke={tone}
        strokeWidth={6.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={46.5} cy={21.5} r={3.15} fill="none" stroke={accent} strokeWidth={2.9} />
    </>
  );
}

/** The icon-only mark. `tone` = the G colour, `accent` = road/node colour. */
export function LogoMark({
  size = 32,
  tone = GARAGE_BLACK,
  accent = BRAND_EMERALD,
  className,
  title = "GarageOS",
}: {
  size?: number;
  tone?: string;
  accent?: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <MarkPaths tone={tone} accent={accent} />
    </svg>
  );
}

/** The mark inside the obsidian app tile (for splash / large brand moments). */
export function LogoTile({ size = 96, radius = 0.25 }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * radius,
        background: GARAGE_BLACK,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 10px 30px -8px rgba(0,0,0,.5)",
      }}
    >
      <LogoMark size={size} tone={GARAGE_WHITE} accent={BRAND_EMERALD} />
    </div>
  );
}

/** Horizontal lockup: mark + wordmark. `theme` picks the palette. */
export function Logo({
  size = 28,
  theme = "light",
  showWordmark = true,
  className,
  style,
}: {
  size?: number;
  theme?: "light" | "dark";
  showWordmark?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const dark = theme === "dark";
  const tone = dark ? GARAGE_WHITE : GARAGE_BLACK;
  const accent = BRAND_EMERALD;
  const osColor = BRAND_EMERALD;
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.42, ...style }}>
      <LogoMark size={size * 1.5} tone={tone} accent={accent} />
      {showWordmark ? (
        <span
          style={{
            fontFamily: "var(--font-brand, 'Manrope'), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: size,
            letterSpacing: "-0.03em",
            color: tone,
            lineHeight: 1,
          }}
        >
          Garage<span style={{ color: osColor }}>OS</span>
        </span>
      ) : null}
    </span>
  );
}
