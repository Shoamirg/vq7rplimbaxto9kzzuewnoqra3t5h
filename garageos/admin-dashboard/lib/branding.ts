import type { CSSProperties } from "react";
import type { Branding } from "@/lib/api/types";

// Convert "#RRGGBB" to the "H S% L%" channel triplet the Tailwind theme tokens
// expect (they are consumed as `hsl(var(--primary))`). Returns null on bad input.
export function hexToHslChannels(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** CSS custom properties that re-theme the app's semantic tokens for a tenant.
 *  Applied on a wrapping element; custom properties inherit to all children. */
// The backend's original default tenant colour. Tenants still on it never chose a
// colour, so they get the GarageOS emerald theme instead of the legacy blue.
const LEGACY_DEFAULT_PRIMARY = "#2563eb";

export function brandCssVars(
  branding: Branding | null | undefined,
): CSSProperties {
  if (!branding) return {};
  if (branding.primary_color.trim().toLowerCase() === LEGACY_DEFAULT_PRIMARY) return {};
  const primary = hexToHslChannels(branding.primary_color);
  const accent = hexToHslChannels(branding.accent_color);
  if (!primary) return {};
  // Compare black/white against the actual rounded HSL token, which can differ
  // slightly from the stored hex. Either choice has at least 4.5:1 contrast.
  const [h, s, l] = primary.split(" ").map(parseFloat);
  const saturation = s / 100,
    lightness = l / 100;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channels = [0, 8, 4].map((offset) => {
    const k = (offset + h / 30) % 12;
    const value =
      lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels.reduce(
    (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
    0,
  );
  const foreground =
    (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
      ? "0 0% 0%"
      : "0 0% 100%";
  return {
    "--primary": primary,
    "--primary-foreground": foreground,
    "--sidebar-active": primary,
    "--ring": primary,
    ...(accent ? { "--accent": accent } : {}),
  } as CSSProperties;
}
