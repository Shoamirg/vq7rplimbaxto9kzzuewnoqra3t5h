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
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** CSS custom properties that re-theme the app's semantic tokens for a tenant.
 *  Applied on a wrapping element; custom properties inherit to all children. */
export function brandCssVars(branding: Branding | null | undefined): CSSProperties {
  if (!branding) return {};
  const primary = hexToHslChannels(branding.primary_color);
  const accent = hexToHslChannels(branding.accent_color);
  if (!primary) return {};
  return {
    "--primary": primary,
    "--sidebar-active": primary,
    "--ring": primary,
    ...(accent ? { "--accent": accent } : {}),
  } as CSSProperties;
}
