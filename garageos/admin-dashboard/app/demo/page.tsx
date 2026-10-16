import type { Metadata } from "next";

import { DemoEntryContent } from "@/components/auth/demo-entry-content";
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  title: "Jonli demo — GarageOS",
  description: "GarageOS’ni demo ma’lumotlarda koʻring — roʻyxatdan oʻtmasdan, emailsiz. Butun platforma boʻylab faqat koʻrish rejimidagi sayohat.",
};

// The client content coordinates demo identity with login/logout in other tabs
// (via DemoEntryButton) and renders in the app locale (uz by default).
export default function DemoEntryPage() {
  return <DemoEntryContent />;
}
