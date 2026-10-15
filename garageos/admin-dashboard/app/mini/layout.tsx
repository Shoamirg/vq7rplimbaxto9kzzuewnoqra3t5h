import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";

import { MiniShell } from "@/components/mini/mini-shell";
import { I18nProvider } from "@/lib/i18n/context";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = {
  title: "My Garage",
  description: "Your vehicles, service, billing and roadside help.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fafc",
};

export default async function MiniLayout({ children }: { children: React.ReactNode }) {
  // Resolve the locale server-side (from the cookie) so there's no flash of the
  // wrong language; the Mini App also auto-detects Telegram's language on mount.
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(cookieLocale) ? cookieLocale : "uz";

  return (
    <>
      {/* Telegram Mini App SDK — optional at runtime; the app falls back to a
          dev sign-in when it (or Telegram) is absent. */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <I18nProvider initialLocale={initialLocale}>
        <MiniShell>{children}</MiniShell>
      </I18nProvider>
    </>
  );
}
