import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { LegalContent } from "@/components/marketing/pages/legal-content";

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/terms");
}

export default function TermsPage() {
  return <LegalContent document="terms" />;
}
