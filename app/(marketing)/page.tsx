import type { Metadata } from "next";
import QRCode from "qrcode";

import { LandingPage } from "@/components/marketing/landing-page";
import { MARKETING_LINKS } from "@/lib/marketing-i18n";

// The public marketing home. Authenticated staff are sent to /dashboard by the
// middleware before this renders; unauthenticated visitors see the landing page.
export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description:
    "Telegram bookings, 1-tap estimate approvals, parts stock and a zero-leak ledger — one system for auto repair, detailing, car wash and tire shops.",
};

export default async function HomePage() {
  // Rendered on the server so the QR library never ships to the browser.
  const qrSvg = await QRCode.toString(MARKETING_LINKS.telegramPassport, {
    type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111315", light: "#00000000" },
  });
  return <LandingPage qrSvg={qrSvg} />;
}
