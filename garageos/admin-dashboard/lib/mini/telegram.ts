"use client";

// Telegram WebApp SDK helpers. Every call degrades gracefully to a no-op when
// the app runs outside Telegram (plain browser / Playwright), so screens can
// call haptic()/themeScheme() unconditionally.

interface HapticFeedback {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "error" | "success" | "warning") => void;
  selectionChanged?: () => void;
}

interface TelegramWebApp {
  initData?: string;
  colorScheme?: "light" | "dark";
  ready?: () => void;
  expand?: () => void;
  HapticFeedback?: HapticFeedback;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

export function telegram(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function isTelegram(): boolean {
  return Boolean(telegram()?.initData);
}

export function themeScheme(): "light" | "dark" {
  return telegram()?.colorScheme ?? "light";
}

type Haptic = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

/** Fire a Telegram haptic. No-op outside Telegram or when the SDK lacks it. */
export function haptic(kind: Haptic = "light"): void {
  const h = telegram()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "success" || kind === "warning" || kind === "error") {
      h.notificationOccurred?.(kind);
    } else if (kind === "selection") {
      h.selectionChanged?.();
    } else {
      h.impactOccurred?.(kind);
    }
  } catch {
    /* SDK version mismatch — ignore */
  }
}
