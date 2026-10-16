import type { Metadata } from "next";

import { DocsContent } from "@/components/marketing/pages/docs-content";

export const metadata: Metadata = {
  title: "Qoʻllanma — GarageOS",
  description: "GarageOS’da servisni qanday yuritish: bronlar, mijozlar, avtomobillar, pasportlar, hisob-kitob, hisobotlar va Telegram ilovasi.",
};

export default function DocsPage() {
  return <DocsContent />;
}
