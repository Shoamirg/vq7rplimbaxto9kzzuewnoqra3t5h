import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { MiniShell } from "@/components/mini/mini-shell";

export const metadata: Metadata = {
  title: "My Garage",
  description: "Your vehicles, service, billing and roadside help.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f8fafc",
};

export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Telegram Mini App SDK — optional at runtime; the app falls back to a
          dev sign-in when it (or Telegram) is absent. */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <MiniShell>{children}</MiniShell>
    </>
  );
}
