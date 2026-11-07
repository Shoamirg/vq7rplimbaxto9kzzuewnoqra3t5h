import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Body font — Cyrillic subset added so RU/UZ render in Inter, not a fallback.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-brand" });
const telemetry = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-telemetry" });

export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description: "Manage your garage, vehicles, customers, and appointments from one dashboard.",
  applicationName: "GarageOS",
};

export const viewport: Viewport = {
  themeColor: "#E4E6E9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={`${inter.variable} ${jakarta.variable} ${archivo.variable} ${telemetry.variable}`}>
      <body>{children}</body>
    </html>
  );
}
