// Lightweight i18n dictionaries for GarageOS. Three locales: English, Russian,
// Uzbek (Latin). Keys are dotted paths; the `t()` helper walks them and falls
// back to English, then to the raw key, so a missing translation never crashes.
//
// This is intentionally dependency-free — a full library (next-intl) can replace
// it later without changing call sites, since components only touch `t("nav.x")`.

import { MINI_DICTIONARY } from "./mini-dictionary";

export const LOCALES = ["en", "ru", "uz"] as const;
export type Locale = (typeof LOCALES)[number];

// Cookie name + guard live here (a server-safe module) so both the server
// layout and the client provider can use them.
export const LOCALE_COOKIE = "garageos_locale";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export const LOCALE_META: Record<Locale, { label: string; native: string; flag: string }> = {
  en: { label: "English", native: "English", flag: "🇬🇧" },
  ru: { label: "Russian", native: "Русский", flag: "🇷🇺" },
  uz: { label: "Uzbek", native: "Oʻzbek", flag: "🇺🇿" },
};

type Dict = Record<string, string>;

export const DICTIONARIES: Record<Locale, Dict> = {
  en: {
    "brand.tagline": "Admin Panel",
    // section headers
    "section.workspace": "Workspace",
    "section.crm": "Customers & Vehicles",
    "section.operations": "Operations",
    "section.business": "Business",
    "section.system": "System",
    // nav
    "nav.dashboard": "Dashboard",
    "nav.calendar": "Calendar",
    "nav.appointments": "Appointments",
    "nav.vehicles": "Vehicles",
    "nav.customers": "Customers",
    "nav.operations": "Operations",
    "nav.inbox": "Inbox",
    "nav.billing": "Billing",
    "nav.inventory": "Inventory",
    "nav.reports": "Reports",
    "nav.settings": "Settings",
    "nav.support": "Help & Support",
    // actions / chrome
    "action.new_appointment": "New Appointment",
    "action.collapse": "Collapse",
    "action.expand": "Expand",
    "action.back_dashboard": "Back to dashboard",
    "topbar.search": "Search customers, vehicles, plate, VIN…",
    "menu.profile": "Profile",
    "menu.account": "Account Settings",
    "menu.messages": "Messages",
    "menu.help": "Help & Support",
    "menu.signout": "Sign Out",
    "menu.language": "Language",
    // generic placeholder page
    "soon.badge": "Coming soon",
    "inventory.title": "Inventory is on the way",
    "inventory.desc": "Parts, stock levels, and reorder alerts will live here — tied to the same jobs and vehicles you already manage.",
    "reports.title": "Reports & analytics",
    "reports.desc": "Revenue, technician throughput, and fleet-health trends. Built on the data GarageOS already collects.",
    "settings.title": "Settings",
    "settings.desc": "Workspace branding, team, and preferences. Language can already be changed from the top bar.",
    "support.title": "Help & support",
    "support.desc": "Guides and contact options will appear here. In the meantime, reach the team from the account menu.",
    "inbox.title": "Unified Inbox is almost here",
    "inbox.desc": "One place for every customer and team conversation — across Telegram, web, phone and email — tied to the same cases, vehicles and customers.",
  },
  ru: {
    "brand.tagline": "Панель управления",
    "section.workspace": "Рабочее место",
    "section.crm": "Клиенты и авто",
    "section.operations": "Операции",
    "section.business": "Бизнес",
    "section.system": "Система",
    "nav.dashboard": "Панель",
    "nav.calendar": "Календарь",
    "nav.appointments": "Записи",
    "nav.vehicles": "Автомобили",
    "nav.customers": "Клиенты",
    "nav.operations": "Операции",
    "nav.inbox": "Входящие",
    "nav.billing": "Оплаты",
    "nav.inventory": "Склад",
    "nav.reports": "Отчёты",
    "nav.settings": "Настройки",
    "nav.support": "Поддержка",
    "action.new_appointment": "Новая запись",
    "action.collapse": "Свернуть",
    "action.expand": "Развернуть",
    "action.back_dashboard": "На панель",
    "topbar.search": "Поиск клиентов, авто, номера, VIN…",
    "menu.profile": "Профиль",
    "menu.account": "Настройки аккаунта",
    "menu.messages": "Сообщения",
    "menu.help": "Помощь и поддержка",
    "menu.signout": "Выйти",
    "menu.language": "Язык",
    "soon.badge": "Скоро",
    "inventory.title": "Склад уже в пути",
    "inventory.desc": "Запчасти, остатки и уведомления о заказе появятся здесь — связаны с теми же работами и автомобилями.",
    "reports.title": "Отчёты и аналитика",
    "reports.desc": "Выручка, загрузка мастеров и динамика состояния автопарка. На основе данных, которые GarageOS уже собирает.",
    "settings.title": "Настройки",
    "settings.desc": "Брендинг, команда и предпочтения. Язык уже можно сменить в верхней панели.",
    "support.title": "Помощь и поддержка",
    "support.desc": "Руководства и контакты появятся здесь. Пока свяжитесь с командой через меню аккаунта.",
    "inbox.title": "Единый Входящий почти готов",
    "inbox.desc": "Все переписки с клиентами и командой в одном месте — Telegram, веб, телефон и email — связанные с теми же обращениями, авто и клиентами.",
  },
  uz: {
    "brand.tagline": "Boshqaruv paneli",
    "section.workspace": "Ish maydoni",
    "section.crm": "Mijozlar va avtolar",
    "section.operations": "Operatsiyalar",
    "section.business": "Biznes",
    "section.system": "Tizim",
    "nav.dashboard": "Boshqaruv paneli",
    "nav.calendar": "Kalendar",
    "nav.appointments": "Qabullar",
    "nav.vehicles": "Avtomobillar",
    "nav.customers": "Mijozlar",
    "nav.operations": "Operatsiyalar",
    "nav.inbox": "Xabarlar",
    "nav.billing": "Toʻlovlar",
    "nav.inventory": "Ombor",
    "nav.reports": "Hisobotlar",
    "nav.settings": "Sozlamalar",
    "nav.support": "Yordam",
    "action.new_appointment": "Yangi qabul",
    "action.collapse": "Yigʻish",
    "action.expand": "Yoyish",
    "action.back_dashboard": "Boshqaruvga qaytish",
    "topbar.search": "Mijoz, avto, raqam, VIN qidirish…",
    "menu.profile": "Profil",
    "menu.account": "Hisob sozlamalari",
    "menu.messages": "Xabarlar",
    "menu.help": "Yordam va qoʻllab-quvvatlash",
    "menu.signout": "Chiqish",
    "menu.language": "Til",
    "soon.badge": "Tez orada",
    "inventory.title": "Ombor tez orada",
    "inventory.desc": "Ehtiyot qismlar, qoldiqlar va qayta buyurtma ogohlantirishlari shu yerda boʻladi — oʻsha ishlar va avtolarga bogʻliq.",
    "reports.title": "Hisobot va tahlil",
    "reports.desc": "Daromad, ustalar unumdorligi va avtopark holati tendensiyalari. GarageOS allaqachon yigʻayotgan maʼlumotlar asosida.",
    "settings.title": "Sozlamalar",
    "settings.desc": "Brending, jamoa va afzalliklar. Tilni yuqori paneldan hozir ham oʻzgartirish mumkin.",
    "support.title": "Yordam va qoʻllab-quvvatlash",
    "support.desc": "Qoʻllanmalar va aloqa shu yerda paydo boʻladi. Hozircha hisob menyusidan jamoaga murojaat qiling.",
    "inbox.title": "Yagona Xabarlar qutisi tez orada",
    "inbox.desc": "Mijoz va jamoa bilan barcha muloqotlar bir joyda — Telegram, veb, telefon va email — oʻsha ishlar, avtolar va mijozlarga bogʻliq.",
  },
};

export type TParams = Record<string, string | number>;

function interpolate(s: string, params?: TParams): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

export function translate(locale: Locale, key: string, params?: TParams): string {
  const raw = DICTIONARIES[locale]?.[key] ?? DICTIONARIES.en[key] ?? key;
  return interpolate(raw, params);
}

// Plural-aware lookup. Dictionary stores forms as `${key}.one`, `.few`, `.many`,
// `.other`; the correct category is chosen per-locale via Intl.PluralRules
// (Russian/Uzbek have richer plural rules than English). `{count}` is filled in.
export function translatePlural(
  locale: Locale,
  key: string,
  count: number,
  params?: TParams,
): string {
  const cat = new Intl.PluralRules(locale).select(count);
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  const raw =
    dict[`${key}.${cat}`] ??
    dict[`${key}.other`] ??
    DICTIONARIES.en[`${key}.other`] ??
    DICTIONARIES.en[`${key}.one`] ??
    key;
  return interpolate(raw, { count, ...params });
}

// Locales that render right-to-left. None yet (en/ru/uz are all LTR), but call
// sites read this so adding Arabic/Hebrew later is a dictionary change, not a
// layout rewrite.
const RTL_LOCALES: readonly Locale[] = [];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function textDirection(locale: Locale): "ltr" | "rtl" {
  return isRtl(locale) ? "rtl" : "ltr";
}

// Fold the Mini App strings into the main dictionaries so `t()` resolves them
// the same way (kept in a separate file only to keep this module readable).
for (const locale of LOCALES) {
  Object.assign(DICTIONARIES[locale], MINI_DICTIONARY[locale]);
}
