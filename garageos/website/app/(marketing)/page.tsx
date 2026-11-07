import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { LandingPage } from "@/components/marketing/landing-page";

// The public marketing home. Authenticated staff are sent to /dashboard by the
// middleware before this renders; unauthenticated visitors see the landing page.
export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/");
}

export default function HomePage() {
  return <LandingPage />;
}
