// Server-only: reads request headers. Import from pages/layouts, never from client components.
import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  DEFAULT_MARKETING_LOCALE, isMarketingLocale, localizedPath, MARKETING_LOCALE_HEADER,
  MARKETING_LOCALE_TAGS, MARKETING_LOCALES, SITE_URL, type MarketingLocale,
} from "./marketing-locale";

/** Locale of the current request, as resolved from the URL by middleware. */
export async function requestLocale(): Promise<MarketingLocale> {
  const value = (await headers()).get(MARKETING_LOCALE_HEADER);
  return isMarketingLocale(value) ? value : DEFAULT_MARKETING_LOCALE;
}

type PageMeta = Record<MarketingLocale, { title: string; description: string }>;

const PAGES = {
  "/": {
    uz: {
      title: "GarageOS — avtoservis uchun yagona tizim",
      description: "Ilova orqali bron, 1 bosishda smeta tasdiqlash, ehtiyot qismlar ombori va kassa — avtoservis, deteyling, avtomoyka va shinomontaj uchun bitta tizim. 14 kun bepul.",
    },
    ru: {
      title: "GarageOS — единая система для автосервиса",
      description: "Запись через приложение, согласование сметы в 1 клик, склад запчастей и касса без утечек — одна система для автосервиса, детейлинга, мойки и шиномонтажа. 14 дней бесплатно.",
    },
    en: {
      title: "GarageOS — The operating system for modern garages",
      description: "App bookings, 1-tap estimate approvals, parts stock and a zero-leak ledger — one system for auto repair, detailing, car wash and tire shops. 14-day free trial.",
    },
  },
  "/pricing": {
    uz: { title: "Narxlar — GarageOS", description: "Avtoservislar uchun oddiy oylik narxlar: Start, Pro Servis va Tarmoq tariflari. 14 kun bepul, kartasiz." },
    ru: { title: "Тарифы — GarageOS", description: "Простые ежемесячные тарифы для автосервисов: Старт, Про Сервис и Сеть СТО. 14 дней бесплатно, без карты." },
    en: { title: "Pricing — GarageOS", description: "Simple monthly pricing for garages: Starter, Pro Garage and Multi-Location. 14-day free trial, no card required." },
  },
  "/security": {
    uz: { title: "Xavfsizlik va ishonch — GarageOS", description: "GarageOS servisingiz ma’lumotlarini qanday himoya qiladi: servislar ajratilgani, shifrlangan ulanish, audit jurnali, kunlik zaxira nusxalar va ma’lumotlarga toʻliq egalik." },
    ru: { title: "Безопасность и доверие — GarageOS", description: "Как GarageOS защищает данные сервиса: изоляция сервисов, шифрование, журнал аудита, ежедневные резервные копии и полное владение данными." },
    en: { title: "Security & trust — GarageOS", description: "How GarageOS protects your shop’s data: tenant isolation, encryption in transit, an audit trail, nightly verified backups and full data ownership." },
  },
  "/docs": {
    uz: { title: "Qoʻllanma — GarageOS", description: "GarageOS’da servisni qanday yuritish: bronlar, mijozlar, avtomobillar, pasportlar, hisob-kitob, hisobotlar va mobil ilova." },
    ru: { title: "Документация — GarageOS", description: "Как вести сервис в GarageOS: записи, клиенты, автомобили, паспорта, расчёты, отчёты и мобильное приложение." },
    en: { title: "Documentation — GarageOS", description: "How to run your shop in GarageOS: bookings, customers, vehicles, passports, billing, reports and the mobile app." },
  },
  "/privacy": {
    uz: { title: "Maxfiylik siyosati — GarageOS", description: "GarageOS shaxsiy ma’lumotlarni qanday yigʻadi, ishlatadi va himoya qiladi." },
    ru: { title: "Политика конфиденциальности — GarageOS", description: "Как GarageOS собирает, использует и защищает персональные данные." },
    en: { title: "Privacy Policy — GarageOS", description: "How GarageOS collects, uses and protects personal data." },
  },
  "/terms": {
    uz: { title: "Foydalanish shartlari — GarageOS", description: "GarageOS platformasidan foydalanish shartlari." },
    ru: { title: "Условия использования — GarageOS", description: "Условия использования платформы GarageOS." },
    en: { title: "Terms of Service — GarageOS", description: "The terms for using the GarageOS platform." },
  },
} satisfies Record<string, PageMeta>;

export type MarketingPage = keyof typeof PAGES;

/** Localized title/description, canonical URL and hreflang alternates for a marketing page. */
export async function marketingMetadata(page: MarketingPage): Promise<Metadata> {
  const locale = await requestLocale();
  const { title, description } = PAGES[page][locale];
  const languages = Object.fromEntries(
    MARKETING_LOCALES.map((code) => [MARKETING_LOCALE_TAGS[code].lang, localizedPath(code, page)]),
  );
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: localizedPath(locale, page),
      languages: { ...languages, "x-default": localizedPath(DEFAULT_MARKETING_LOCALE, page) },
    },
    openGraph: {
      type: "website",
      siteName: "GarageOS",
      title,
      description,
      url: localizedPath(locale, page),
      locale: MARKETING_LOCALE_TAGS[locale].og,
      alternateLocale: MARKETING_LOCALES.filter((code) => code !== locale).map((code) => MARKETING_LOCALE_TAGS[code].og),
    },
  };
}
