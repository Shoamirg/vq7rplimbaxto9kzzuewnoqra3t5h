import type { Metadata } from "next";

import { LegalContent } from "@/components/marketing/pages/legal-content";

export const metadata: Metadata = {
  title: "Foydalanish shartlari — GarageOS",
  description: "GarageOS platformasidan foydalanish shartlari.",
};

export default function TermsPage() {
  return <LegalContent document="terms" />;
}
