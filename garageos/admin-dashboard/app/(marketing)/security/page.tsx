import type { Metadata } from "next";

import { SecurityContent } from "@/components/marketing/pages/security-content";

export const metadata: Metadata = {
  title: "Xavfsizlik va ishonch — GarageOS",
  description: "GarageOS servisingiz ma’lumotlarini qanday himoya qiladi: servislar ajratilgani, shifrlangan ulanish, audit jurnali, kunlik zaxira nusxalar va ma’lumotlarga toʻliq egalik.",
};

export default function SecurityPage() {
  return <SecurityContent />;
}
