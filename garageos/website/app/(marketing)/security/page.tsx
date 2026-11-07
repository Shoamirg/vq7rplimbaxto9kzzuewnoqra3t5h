import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { SecurityContent } from "@/components/marketing/pages/security-content";

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/security");
}

export default function SecurityPage() {
  return <SecurityContent />;
}
