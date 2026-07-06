// Leaf strings for route error/loading boundaries and skeleton loaders.
// Folded into the main DICTIONARIES so `t("leaf.*")` resolves everywhere.
import type { Locale } from "../dictionaries";

export const LEAF_DICT: Record<Locale, Record<string, string>> = {
  en: {
    // Route error boundaries (title + description pairs)
    "leaf.calendar_error_title": "The calendar couldn't load",
    "leaf.calendar_error_desc":
      "We couldn't pull the schedule, mechanics, and appointments for this range. Retry, or check that the API is reachable — nothing was changed.",
    "leaf.customers_error_title": "Customers couldn't load",
    "leaf.customers_error_desc":
      "We couldn't reach the API to load your customers. Retry, or check your connection — nothing was changed.",
    "leaf.dashboard_error_title": "The dashboard couldn't load",
    "leaf.dashboard_error_desc":
      "We couldn't reach the API to pull today's stats and fleet health. This is usually temporary — retry, or check that the backend is running.",
    "leaf.vehicle_error_title": "This vehicle's health report couldn't load",
    "leaf.vehicle_error_desc":
      "We couldn't fetch the maintenance history and health score for this vehicle. Retry, or check your connection — the record itself is safe.",
    "leaf.vehicles_error_title": "The vehicle list couldn't load",
    "leaf.vehicles_error_desc":
      "We couldn't fetch your fleet just now. Retry, or check your connection — your vehicles are safe.",
    // Loading skeleton aria-labels
    "leaf.loading_customers": "Loading customers",
    "leaf.loading_calendar": "Loading calendar",
    "leaf.loading_dashboard": "Loading dashboard",
    "leaf.loading_vehicle_health": "Loading vehicle health",
    "leaf.loading_vehicles": "Loading vehicles",
  },
  ru: {
    "leaf.calendar_error_title": "Не удалось загрузить календарь",
    "leaf.calendar_error_desc":
      "Не удалось получить расписание, мастеров и записи за этот период. Повторите или проверьте доступность API — ничего не изменено.",
    "leaf.customers_error_title": "Не удалось загрузить клиентов",
    "leaf.customers_error_desc":
      "Не удалось обратиться к API для загрузки клиентов. Повторите или проверьте подключение — ничего не изменено.",
    "leaf.dashboard_error_title": "Не удалось загрузить панель",
    "leaf.dashboard_error_desc":
      "Не удалось обратиться к API за сегодняшней статистикой и состоянием автопарка. Обычно это временно — повторите или проверьте, запущен ли бэкенд.",
    "leaf.vehicle_error_title": "Не удалось загрузить отчёт о состоянии автомобиля",
    "leaf.vehicle_error_desc":
      "Не удалось получить историю обслуживания и оценку состояния этого автомобиля. Повторите или проверьте подключение — сама запись в безопасности.",
    "leaf.vehicles_error_title": "Не удалось загрузить список автомобилей",
    "leaf.vehicles_error_desc":
      "Не удалось получить ваш автопарк прямо сейчас. Повторите или проверьте подключение — ваши автомобили в безопасности.",
    "leaf.loading_customers": "Загрузка клиентов",
    "leaf.loading_calendar": "Загрузка календаря",
    "leaf.loading_dashboard": "Загрузка панели",
    "leaf.loading_vehicle_health": "Загрузка состояния автомобиля",
    "leaf.loading_vehicles": "Загрузка автомобилей",
  },
  uz: {
    "leaf.calendar_error_title": "Kalendarni yuklab boʻlmadi",
    "leaf.calendar_error_desc":
      "Ushbu davr uchun jadval, ustalar va qabullarni olib boʻlmadi. Qayta urinib koʻring yoki API mavjudligini tekshiring — hech narsa oʻzgartirilmadi.",
    "leaf.customers_error_title": "Mijozlarni yuklab boʻlmadi",
    "leaf.customers_error_desc":
      "Mijozlarni yuklash uchun API bilan bogʻlanib boʻlmadi. Qayta urinib koʻring yoki ulanishni tekshiring — hech narsa oʻzgartirilmadi.",
    "leaf.dashboard_error_title": "Boshqaruv panelini yuklab boʻlmadi",
    "leaf.dashboard_error_desc":
      "Bugungi statistika va avtopark holatini olish uchun API bilan bogʻlanib boʻlmadi. Bu odatda vaqtinchalik — qayta urinib koʻring yoki backend ishlayotganini tekshiring.",
    "leaf.vehicle_error_title": "Bu avtomobilning holat hisobotini yuklab boʻlmadi",
    "leaf.vehicle_error_desc":
      "Bu avtomobilning texnik xizmat tarixi va holat bahosini olib boʻlmadi. Qayta urinib koʻring yoki ulanishni tekshiring — yozuvning oʻzi xavfsiz.",
    "leaf.vehicles_error_title": "Avtomobillar roʻyxatini yuklab boʻlmadi",
    "leaf.vehicles_error_desc":
      "Hozircha avtoparkingizni olib boʻlmadi. Qayta urinib koʻring yoki ulanishni tekshiring — avtomobillaringiz xavfsiz.",
    "leaf.loading_customers": "Mijozlar yuklanmoqda",
    "leaf.loading_calendar": "Kalendar yuklanmoqda",
    "leaf.loading_dashboard": "Boshqaruv paneli yuklanmoqda",
    "leaf.loading_vehicle_health": "Avtomobil holati yuklanmoqda",
    "leaf.loading_vehicles": "Avtomobillar yuklanmoqda",
  },
};
