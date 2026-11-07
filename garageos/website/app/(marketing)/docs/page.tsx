import type { Metadata } from "next";

import { marketingMetadata } from "@/lib/marketing-meta";
import { DocsContent } from "@/components/marketing/pages/docs-content";

export function generateMetadata(): Promise<Metadata> {
  return marketingMetadata("/docs");
}

export default function DocsPage() {
  return <DocsContent />;
}
