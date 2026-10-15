import { landingMessages } from "./marketing-landing-copy";

export type MarketingLocale = "uz" | "ru" | "en";
export const MARKETING_LOCALE_STORAGE_KEY = "garageos-marketing-locale";

export function isMarketingLocale(value: unknown): value is MarketingLocale {
  return value === "uz" || value === "ru" || value === "en";
}

// Shared by server-rendered content and the client navigation.
export const MARKETING_LINKS = {
  demo: "mailto:hello@garageos.app?subject=GarageOS%20demo%20request",
  signIn: "/login",
  liveDemo: "/demo",
} as const;

export const marketingMessages = {
  uz: {
    nav: {
      home: "GarageOS bosh sahifa", primary: "Asosiy navigatsiya", language: "Sayt tili",
      product: "Imkoniyatlar", workflow: "Ish jarayoni", vehicleRecord: "Avto tarixi",
      pricing: "Narxlar", signIn: "Kirish", bookDemo: "Demo so‘rash", demo: "Demo",
    },
    footer: {
      description: "Mijozlar, buyurtmalar va hisoblar — bir joyda.",
      product: "Mahsulot", features: "Imkoniyatlar", pricing: "Narxlar", security: "Xavfsizlik",
      documentation: "Qo‘llanma", liveDemo: "Demoni ko‘rish", company: "Kompaniya",
      bookDemo: "Demo so‘rash", contact: "Bog‘lanish", signIn: "Kirish",
      legal: "Huquqiy ma’lumot", privacy: "Maxfiylik", terms: "Foydalanish shartlari",
      rights: "Barcha huquqlar himoyalangan.", tagline: "Avtoservislar uchun yaratilgan.",
    },
    cta: {
      title: "Ish jarayonini ko‘ring", body: "Demo servisni o‘rganing yoki tanishtiruv so‘rang.",
      explore: "Demoni ko‘rish", bookDemo: "Demo so‘rash",
    },
    landing: landingMessages.uz,
  },
  ru: {
    nav: {
      home: "Главная GarageOS", primary: "Основная навигация", language: "Язык сайта",
      product: "Возможности", workflow: "Рабочий процесс", vehicleRecord: "История авто",
      pricing: "Цены", signIn: "Войти", bookDemo: "Заказать демо", demo: "Демо",
    },
    footer: {
      description: "Клиенты, заказ-наряды и счета — вместе.",
      product: "Продукт", features: "Возможности", pricing: "Цены", security: "Безопасность",
      documentation: "Документация", liveDemo: "Открыть демо", company: "Компания",
      bookDemo: "Заказать демо", contact: "Связаться", signIn: "Войти",
      legal: "Правовая информация", privacy: "Конфиденциальность", terms: "Условия использования",
      rights: "Все права защищены.", tagline: "Создано для автосервисов.",
    },
    cta: {
      title: "Посмотрите на практике", body: "Изучите демо-сервис или закажите презентацию.",
      explore: "Открыть демо", bookDemo: "Заказать демо",
    },
    landing: landingMessages.ru,
  },
  en: {
    nav: {
      home: "GarageOS home", primary: "Primary navigation", language: "Website language",
      product: "Product", workflow: "Workflow", vehicleRecord: "Vehicle record",
      pricing: "Pricing", signIn: "Sign in", bookDemo: "Book a demo", demo: "Demo",
    },
    footer: {
      description: "Customers, work orders and billing together.",
      product: "Product", features: "Features", pricing: "Pricing", security: "Security",
      documentation: "Documentation", liveDemo: "Live demo", company: "Company",
      bookDemo: "Book a demo", contact: "Contact", signIn: "Sign in",
      legal: "Legal", privacy: "Privacy", terms: "Terms",
      rights: "All rights reserved.", tagline: "Built for the trade.",
    },
    cta: {
      title: "See it in action", body: "Explore the demo shop or request a walkthrough.",
      explore: "Explore the demo", bookDemo: "Book a demo",
    },
    landing: landingMessages.en,
  },
};

export type MarketingMessages = (typeof marketingMessages)[MarketingLocale];
