// ─── GarageOS Design Tokens: Colors ───────────────────────────

export const colors = {
  primary: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#2563eb",
    600: "#1d4ed8",
    700: "#1e40af",
    800: "#1e3a8a",
    900: "#172554",
  },
  success: {
    DEFAULT: "#10b981",
    light: "#d1fae5",
    dark: "#065f46",
  },
  warning: {
    DEFAULT: "#f59e0b",
    light: "#fef3c7",
    dark: "#92400e",
  },
  danger: {
    DEFAULT: "#ef4444",
    light: "#fee2e2",
    dark: "#991b1b",
  },
  info: {
    DEFAULT: "#3b82f6",
    light: "#dbeafe",
    dark: "#1e40af",
  },
  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
} as const;

export type ColorKey = keyof typeof colors;
