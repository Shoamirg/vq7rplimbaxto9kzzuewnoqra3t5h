import type { Locale } from "./dictionaries";

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", uz: "uz-Latn-UZ" };
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const SHORT_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const SHORT_DAYS = ["yak", "dush", "sesh", "chor", "pay", "jum", "shan"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Chromium and Node can both advertise Uzbek support while shipping different
// ICU data ("M08" / "UZS" versus "avg" / "soʻm"). Build Uzbek labels ourselves
// from stable English numeric parts so SSR and the browser agree.
function uzNumber(value: number, fractionDigits?: number): string {
  const options: Intl.NumberFormatOptions = fractionDigits === undefined ? {} : {
    minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
  };
  return new Intl.NumberFormat("en-US", options).formatToParts(value || 0)
    .map((part) => part.type === "group" ? "\u00a0" : part.type === "decimal" ? "," : part.value).join("");
}

function uzDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  const timeZone = options.timeZone ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }).formatToParts(date);
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  const month = Number(value("month")) - 1;
  const day = Number(value("day"));
  const year = value("year");
  const weekday = EN_DAYS.indexOf(value("weekday"));
  const style = options.dateStyle;
  const monthStyle = options.month ?? (style ? style === "long" || style === "full" ? "long" : "short" : undefined);
  const dayStyle = options.day ?? (style ? "numeric" : undefined);
  const yearStyle = options.year ?? (style ? "numeric" : undefined);
  const labels: string[] = [];
  if (dayStyle) labels.push(dayStyle === "2-digit" ? String(day).padStart(2, "0") : String(day));
  if (monthStyle) labels.push(monthStyle === "long" ? MONTHS[month] : monthStyle === "short" || monthStyle === "narrow" ? SHORT_MONTHS[month] : monthStyle === "2-digit" ? String(month + 1).padStart(2, "0") : String(month + 1));
  if (yearStyle) labels.push(yearStyle === "2-digit" ? year.slice(-2) : year);
  const weekdayStyle = options.weekday ?? (style === "full" ? "long" : undefined);
  let result = labels.join(" ");
  if (weekdayStyle && weekday >= 0) result = (weekdayStyle === "long" ? DAYS[weekday] : SHORT_DAYS[weekday]) + (result ? ", " + result : "");
  if (options.hour || options.minute || options.second || options.timeStyle) {
    const clock = new Intl.DateTimeFormat("en-GB", options.timeStyle ? { timeZone, timeStyle: options.timeStyle, hour12: options.hour12 ?? false } : {
      timeZone, hour: options.hour, minute: options.minute, second: options.second, hour12: options.hour12 ?? false,
    }).format(date);
    result += (result ? " · " : "") + clock;
  }
  return result;
}

export function makeFormatters(locale: Locale) {
  const tag = INTL_LOCALE[locale] ?? "en-US";
  return {
    date: (iso?: string | null, options?: Intl.DateTimeFormatOptions) => {
      if (!iso) return "";
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "";
      const opts = options ?? { month: "short", day: "numeric", year: "numeric" };
      return locale === "uz" ? uzDate(date, opts) : date.toLocaleDateString(tag, { timeZone: "UTC", ...opts });
    },
    money: (amount: number, currency = "USD") => {
      if (locale !== "uz") return new Intl.NumberFormat(tag, { style: "currency", currency }).format(amount || 0);
      const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().minimumFractionDigits;
      return uzNumber(amount, digits) + "\u00a0" + (currency === "UZS" ? "so‘m" : currency);
    },
    number: (amount: number) => locale === "uz" ? uzNumber(amount) : new Intl.NumberFormat(tag).format(amount || 0),
  };
}
