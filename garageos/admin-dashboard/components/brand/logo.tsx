import type { CSSProperties } from "react";

// GarageOS mark: a bold "G" ring with a road lane sweeping up through it to a
// telemetry node — vehicle + intelligence + operations. The G uses `tone`, the
// road + node use `accent`, so the same geometry recolors per context (blue on
// dark/app surfaces, gold on the light wordmark).

export const BRAND_BLUE = "#2563EB";
export const BRAND_GOLD = "#D9A322";
export const GARAGE_BLACK = "#0B1220";
export const GARAGE_WHITE = "#F8FAFC";

function MarkPaths({ tone, accent }: { tone: string; accent: string }) {
  return (
    <>
      <path
        d="M46.5 20.5 A19 19 0 1 0 51 41 L38 41 L38 34.5 L50.5 34.5"
        fill="none"
        stroke={tone}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 47 L28 47 L37.5 22 L33.5 22 Z" fill={accent} />
      <path
        d="M25.5 45 L33.5 24"
        fill="none"
        stroke={GARAGE_WHITE}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeDasharray="0.5 4.5"
      />
      <circle cx={36.5} cy={18.5} r={3.6} fill={accent} />
      <circle cx={36.5} cy={18.5} r={1.4} fill={GARAGE_WHITE} />
    </>
  );
}

/** The icon-only mark. `tone` = the G colour, `accent` = road/node colour. */
export function LogoMark({
  size = 32,
  tone = GARAGE_BLACK,
  accent = BRAND_BLUE,
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

/** The mark inside the graphite app tile (for splash / large brand moments). */
export function LogoTile({ size = 96, radius = 0.225 }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * radius,
        background: "linear-gradient(160deg,#111a2e,#0B1220)",
        display: "grid",
        placeItems: "center",
        boxShadow: "0 10px 30px -8px rgba(0,0,0,.5)",
      }}
    >
      <LogoMark size={size * 0.68} tone={GARAGE_WHITE} accent={BRAND_BLUE} />
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
  const accent = dark ? BRAND_BLUE : BRAND_GOLD;
  const osColor = dark ? "#94A3B8" : "#334155";
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.42, ...style }}>
      <LogoMark size={size * 1.5} tone={tone} accent={accent} />
      {showWordmark ? (
        <span
          style={{
            fontFamily: "var(--font-brand, 'Manrope'), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: size,
            letterSpacing: "-0.02em",
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
