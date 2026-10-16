import type { Metadata } from "next";

import { LegalContent } from "@/components/marketing/pages/legal-content";

export const metadata: Metadata = {
  title: "Maxfiylik siyosati — GarageOS",
  description: "GarageOS shaxsiy ma’lumotlarni qanday yigʻadi, ishlatadi va himoya qiladi.",
};

export default function PrivacyPage() {
  return <LegalContent document="privacy" />;
}
