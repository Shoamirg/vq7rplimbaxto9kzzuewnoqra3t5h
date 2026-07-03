import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Body font — Cyrillic subset added so RU/UZ render in Inter, not a fallback.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });
// Brand / display font — the wordmark and headings.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description: "Manage your garage, vehicles, customers, and appointments from one dashboard.",
  manifest: "/manifest.webmanifest",
  applicationName: "GarageOS",
  appleWebApp: { capable: true, title: "GarageOS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable}`}>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
