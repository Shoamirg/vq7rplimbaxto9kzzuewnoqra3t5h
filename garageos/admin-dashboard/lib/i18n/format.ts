// Locale-aware number/date formatting that renders identically on the server
// (Node, full ICU) and in the browser.
//
// Why not plain Intl everywhere: Chrome ships trimmed ICU data for Uzbek —
// `(10363).toLocaleString("uz")` gives "10,363" and dates come out as
// "2026 M03 5" (no month names), while Node prints "10 363" / "5-mar, 2026".
// That mismatch made Uzbek screens look half-formatted. So for `uz` we format
// numbers with ru-RU (identical CLDR grouping/decimal rules) and spell dates
// from our own month/weekday tables. EN/RU go straight through Intl.

import { type Locale } from "./dictionaries";

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", uz: "uz-Latn-UZ" };

const UZ_MONTHS_LONG = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_WEEKDAYS_LONG = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const UZ_WEEKDAYS_SHORT = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];

/** Intl tag to use for NUMBERS (uz -> ru-RU, same separators). */
export function numberTag(locale: Locale): string {
  return locale === "uz" ? "ru-RU" : INTL_LOCALE[locale] ?? "en-US";
}

export function formatNumber(locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(numberTag(locale), opts).format(n || 0);
}

export function formatMoney(locale: Locale, n: number, currency = "USD", opts?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, n, { style: "currency", currency, ...opts });
}

type DateInput = string | number | Date;

// Calendar fields of `d` as seen in opts.timeZone (or the local zone).
function dateParts(d: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: get("year"), month: Number(get("month")) - 1, day: get("day"), weekday };
}

// Uzbek CLDR-style patterns: "5-mar, 2026", "payshanba, 5-mart", "mart, 2026".
function formatUzDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  const { year, month, day, weekday } = dateParts(d, opts.timeZone);
  const longMonth = opts.month === "long";
  const monthName = opts.month ? (longMonth ? UZ_MONTHS_LONG : UZ_MONTHS_SHORT)[month] : "";
  const numericMonth = opts.month === "numeric" || opts.month === "2-digit";

  if (numericMonth) {
    const dd = day.padStart(2, "0");
    const mm = String(month + 1).padStart(2, "0");
    return [opts.day ? dd : null, mm, opts.year ? year : null].filter(Boolean).join(".");
  }

  let core = "";
  if (opts.day && opts.month) core = `${day}-${monthName}`;
  else if (opts.month) core = monthName;
  else if (opts.day) core = day;
  if (opts.year) core = core ? `${core}, ${year}` : year;

  if (opts.weekday) {
    const wd = (opts.weekday === "long" ? UZ_WEEKDAYS_LONG : UZ_WEEKDAYS_SHORT)[weekday];
    core = core ? `${wd}, ${core}` : wd;
  }
  return core;
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** Locale-aware date (no time). Same output on server and client. */
export function formatDate(locale: Locale, input: DateInput, opts: Intl.DateTimeFormatOptions = DEFAULT_DATE): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  if (locale === "uz") return formatUzDate(d, opts);
  return d.toLocaleDateString(INTL_LOCALE[locale] ?? "en-US", opts);
}

/** Locale-aware time of day (uz uses ru-RU's 24h "14:30"). */
export function formatTime(locale: Locale, input: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(numberTag(locale), opts ?? { hour: "2-digit", minute: "2-digit" });
}
