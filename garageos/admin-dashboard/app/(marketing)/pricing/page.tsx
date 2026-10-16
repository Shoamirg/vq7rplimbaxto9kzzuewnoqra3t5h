import type { Metadata } from "next";

import { PricingContent } from "@/components/marketing/pages/pricing-content";

export const metadata: Metadata = {
  title: "Narxlar — GarageOS",
  description: "Avtoservislar uchun oddiy oylik narxlar: Start, Pro Servis va Tarmoq tariflari. 14 kun bepul, kartasiz.",
};

export default function PricingPage() {
  return <PricingContent />;
}
