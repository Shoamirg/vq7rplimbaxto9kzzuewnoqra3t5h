import type { Viewport } from "next";
import { Inter, Inter_Tight, Plus_Jakarta_Sans, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

import { requestLocale } from "@/lib/marketing-meta";
import { MARKETING_LOCALE_TAGS } from "@/lib/marketing-locale";

// Body font — Cyrillic subset added so RU/UZ render in Inter, not a fallback.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
// Archivo (headlines) has no Cyrillic. Russian pages swap to Inter Tight, a tight
// heavy grotesque with full Cyrillic, via the [lang="ru"] rule in globals.css.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-brand-latin" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-brand-cyrillic" });
const telemetry = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-telemetry" });

export const viewport: Viewport = {
  themeColor: "#E4E6E9",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  const fonts = [inter, jakarta, archivo, interTight, telemetry].map((font) => font.variable).join(" ");
  return (
    <html lang={MARKETING_LOCALE_TAGS[locale].lang} className={fonts}>
      <body>{children}</body>
    </html>
  );
}
