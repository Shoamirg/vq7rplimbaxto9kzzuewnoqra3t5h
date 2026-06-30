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
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
  },
} as const;

export type ColorToken = keyof typeof colors;
