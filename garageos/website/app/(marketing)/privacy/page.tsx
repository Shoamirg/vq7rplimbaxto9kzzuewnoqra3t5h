import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { LegalContent } from "@/components/marketing/pages/legal-content";

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/privacy");
}

export default function PrivacyPage() {
  return <LegalContent document="privacy" />;
}
