import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Body font — Cyrillic subset added so RU/UZ render in Inter, not a fallback.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
// GarageOS v2: body, technical display and telemetry. Inter covers Cyrillic.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-brand" });
const telemetry = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-telemetry" });

export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description: "Manage your garage, vehicles, customers, and appointments from one dashboard.",
  manifest: "/manifest.webmanifest",
  applicationName: "GarageOS",
  appleWebApp: { capable: true, title: "GarageOS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E4E6E9" },
    { media: "(prefers-color-scheme: dark)", color: "#181B20" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable} ${archivo.variable} ${telemetry.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
