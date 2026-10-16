export const colors = {
  primary: {
    50: "#e9f7f1",
    100: "#cdeee0",
    200: "#9fdcc3",
    300: "#66c4a0",
    400: "#2fa97c",
    500: "#109868",
    600: "#0c8059",
    700: "#096645",
    800: "#074f36",
    900: "#053a28",
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
