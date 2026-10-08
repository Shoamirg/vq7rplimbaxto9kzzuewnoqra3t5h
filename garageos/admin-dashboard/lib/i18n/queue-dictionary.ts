import type { Locale } from "./dictionaries";

export const QUEUE_DICTIONARY: Record<Locale, Record<string, string>> = {
  en: {
    "queue.select_all": "Select this page", "queue.select_row": "Select appointment for {name}",
    "queue.stats_scope": "Summary of all garage appointments", "queue.stats_date": "Today uses the service's current date; these counts do not follow the filters below.",
    "queue.stats_loading": "Loading appointment summary", "queue.stats_failed": "Appointment summary could not load", "queue.stats_retry": "Retry summary",
    "queue.loading": "Loading appointments", "queue.failed": "Appointments could not load", "queue.retry": "Retry appointments", "queue.refresh": "Refresh appointments",
    "queue.next_seven": "Next 7 days", "queue.page": "Page {page} of {pages} · {total} appointments", "queue.previous": "Previous page", "queue.next": "Next page",
    "queue.hours": "{h} hr", "queue.hours_minutes": "{h} hr {m} min", "queue.unknown": "Not recorded",
    "queue.health_title": "Vehicle health: {score} · {band}", "queue.no_health": "Health unavailable", "queue.no_billing": "No billing document",
    "queue.bulk_result": "{done} updated · {failed} failed · {skipped} not eligible", "queue.working": "Updating appointments",
  },
  ru: {
    "queue.select_all": "Выбрать эту страницу", "queue.select_row": "Выбрать запись клиента {name}",
    "queue.stats_scope": "Сводка по всем записям сервиса", "queue.stats_date": "Сегодня определяется текущей датой сервиса; эти числа не зависят от фильтров ниже.",
    "queue.stats_loading": "Загрузка сводки записей", "queue.stats_failed": "Не удалось загрузить сводку записей", "queue.stats_retry": "Повторить загрузку сводки",
    "queue.loading": "Загрузка записей", "queue.failed": "Не удалось загрузить записи", "queue.retry": "Повторить загрузку записей", "queue.refresh": "Обновить записи",
    "queue.next_seven": "Следующие 7 дней", "queue.page": "Страница {page} из {pages} · записей: {total}", "queue.previous": "Предыдущая страница", "queue.next": "Следующая страница",
    "queue.hours": "{h} ч", "queue.hours_minutes": "{h} ч {m} мин", "queue.unknown": "Не указано",
    "queue.health_title": "Состояние автомобиля: {score} · {band}", "queue.no_health": "Состояние недоступно", "queue.no_billing": "Нет платёжного документа",
    "queue.bulk_result": "Обновлено: {done} · ошибок: {failed} · недоступны: {skipped}", "queue.working": "Обновление записей",
  },
  uz: {
    "queue.select_all": "Shu sahifani belgilash", "queue.select_row": "{name} mijozining navbatini belgilash",
    "queue.stats_scope": "Servisdagi barcha navbatlar hisobi", "queue.stats_date": "Bugun servisning joriy sanasi bo‘yicha hisoblanadi; bu sonlar quyidagi filtrlarga bog‘liq emas.",
    "queue.stats_loading": "Navbatlar hisobi yuklanmoqda", "queue.stats_failed": "Navbatlar hisobini yuklab bo‘lmadi", "queue.stats_retry": "Hisobni qayta yuklash",
    "queue.loading": "Navbatlar yuklanmoqda", "queue.failed": "Navbatlarni yuklab bo‘lmadi", "queue.retry": "Navbatlarni qayta yuklash", "queue.refresh": "Navbatlarni yangilash",
    "queue.next_seven": "Keyingi 7 kun", "queue.page": "{pages} sahifadan {page}-sahifa · jami {total} navbat", "queue.previous": "Oldingi sahifa", "queue.next": "Keyingi sahifa",
    "queue.hours": "{h} soat", "queue.hours_minutes": "{h} soat {m} daqiqa", "queue.unknown": "Kiritilmagan",
    "queue.health_title": "Mashina holati: {score} · {band}", "queue.no_health": "Holat ma’lumoti mavjud emas", "queue.no_billing": "Hisob hujjati yo‘q",
    "queue.bulk_result": "{done} ta yangilandi · {failed} ta xato · {skipped} tasiga amal mumkin emas", "queue.working": "Navbatlar yangilanmoqda",
  },
};
