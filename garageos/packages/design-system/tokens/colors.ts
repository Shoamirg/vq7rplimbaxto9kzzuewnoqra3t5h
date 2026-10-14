// ─── GarageOS Design Tokens: Colors ───────────────────────────

export const colors = {
  canvas: { primary: "#E4E6E9", secondary: "#ECEEEF", blueprint: "#F8F9FA" },
  surface: { solid: "#F5F6F8", elevated: "#FFFFFF", tile: "#ECEEF1", glass: "rgba(245,247,249,.78)", obsidian: "#181B20", input: "#E8EAED" },
  text: { primary: "#111315", secondary: "#686E76", muted: "#949A9F", technical: "#2B3036" },
  action: { primary: "#111315", hover: "#262A30", emerald: "#109868", emeraldHover: "#0B7E55" },
  primary: {
    50: "#F8F9FA",
    100: "#ECEEF1",
    200: "#DCDFE4",
    300: "#D0D5DD",
    400: "#949A9F",
    500: "#686E76",
    600: "#4C525A",
    700: "#2B3036",
    800: "#262A30",
    900: "#111315",
  },
  success: {
    DEFAULT: "#109868",
    light: "#d1fae5",
    dark: "#0B7E55",
  },
  warning: {
    DEFAULT: "#D97706",
    light: "#fef3c7",
    dark: "#92400e",
  },
  danger: {
    DEFAULT: "#DC2626",
    light: "#fee2e2",
    dark: "#991b1b",
  },
  info: {
    DEFAULT: "#2B3036",
    light: "#ECEEF1",
    dark: "#2B3036",
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
