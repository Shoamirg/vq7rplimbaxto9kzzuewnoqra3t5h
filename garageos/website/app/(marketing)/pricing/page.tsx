import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { PricingContent } from "@/components/marketing/pages/pricing-content";

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/pricing");
}

export default function PricingPage() {
  return <PricingContent />;
}
