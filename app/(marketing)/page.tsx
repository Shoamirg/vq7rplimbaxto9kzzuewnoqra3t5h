import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";

// The public marketing home. Authenticated staff are sent to /dashboard by the
// middleware before this renders; unauthenticated visitors see the landing page.
export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description:
    "App bookings, 1-tap estimate approvals, parts stock and a zero-leak ledger — one system for auto repair, detailing, car wash and tire shops.",
};

export default function HomePage() {
  return <LandingPage />;
}
