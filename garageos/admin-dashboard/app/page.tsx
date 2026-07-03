import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";

// The public marketing home. Authenticated staff are sent to /dashboard by the
// middleware before this renders; unauthenticated visitors see the landing page.
export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description:
    "Scheduling, vehicle intelligence, operations, billing, and a customer app in Telegram — one platform for modern garages and multi-location groups.",
};

export default function RootPage() {
  return <LandingPage />;
}
