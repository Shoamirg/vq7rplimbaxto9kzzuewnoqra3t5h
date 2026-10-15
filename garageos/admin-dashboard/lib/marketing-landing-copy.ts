// Public landing copy. Prices and trial terms are not promised before launch.
const en = {
  hero: { eyebrow: "YOUR SHOP. ONE WORKSPACE.", title: "Every job.", accent: "Under control.", detail: "Vehicles, people, payments — together.", demo: "Explore demo", contact: "Talk to us", note: "Sample data · No signup", shopLabel: "Choose your shop" },
  shops: [
    { label: "Auto service", job: "Brake inspection", detail: "Inspection → estimate → repair" },
    { label: "Tire shop", job: "Wheel balancing", detail: "Check → balance → handover" },
    { label: "Detailing", job: "Body polishing", detail: "Inspect → polish → handover" },
  ],
  vehicle: { label: "Vehicle record", sample: "Sample data", alt: "Studio photograph of a white Hyundai Sonata", console: "Service overview", photoCredit: "Photo:", history: "Service history", linked: "Record linked", mileage: "Mileage · service notes", preview: "Sample work order", meta: [["Customer", "Vehicle linked"], ["Service", "Work recorded"], ["History", "Always together"], ["Schedule", "Tashkent time"]] },
  proof: ["Vehicle records", "Work orders", "Estimates", "Local calendar"],
  rolesHeading: { eyebrow: "ONE TEAM", title: "Your role. Your view." },
  rolesLabel: "Choose a role preview",
  roles: [
    { label: "Owner", title: "Shop overview", detail: "Your operations, at a glance.", alt: "Sample GarageOS owner dashboard" },
    { label: "Advisor", title: "Front desk", detail: "Bookings and customers, together.", alt: "Sample GarageOS service calendar" },
    { label: "Mechanic", title: "Assigned work", detail: "Your jobs. Clear next steps.", alt: "Sample GarageOS vehicle service record" },
    { label: "Car owner", title: "Your vehicle", detail: "History, invoices and appointment requests.", alt: "Sample customer portal" },
  ],
  preview: "Interactive preview", screenshot: "Sample screen · English", phone: { greeting: "Your garage", vehicle: "Your vehicle", detail: "Mileage and service history", actions: ["Vehicles", "History", "Invoices"], booking: "Your next visit", request: "Request appointment" },
  capabilitiesHeading: { eyebrow: "THE ESSENTIALS", title: "Less paperwork. More clarity." },
  capabilities: [
    { title: "Vehicle records", label: "Customer + history" },
    { title: "Estimates", label: "Agree before work" },
    { title: "Team access", label: "Your role, your view" },
    { title: "Local calendar", label: "Tashkent time" },
    { title: "Reminders", label: "Date and mileage" },
    { title: "Parts stock", label: "Stock at a glance" },
  ],
  workflowHeading: { eyebrow: "ONE WORKFLOW", title: "Check in. Get it done." },
  workflow: [["Check in", "Customer and vehicle"], ["Inspect", "Record the work"], ["Approve", "Agree the estimate"], ["Complete", "Close the job"], ["Invoice", "Record payment"]],
  estimate: { title: "One-tap approval", label: "Try a sample estimate", item: "Brake inspection", amount: "250,000 UZS", pending: "Awaiting approval", approved: "Approved · sample only", approve: "Approve estimate", reset: "Try again", disclaimer: "Preview only · Nothing is saved" },
  passport: { eyebrow: "VEHICLE PASSPORT", title: "Every visit, remembered.", detail: "Mileage. Maintenance. One service history.", alt: "Example vehicle service history and maintenance overview" },
  pricing: { eyebrow: "YOUR SETUP", title: "Built for your shop.", currency: "Preferred quote currency", onRequest: "On request", quote: "Ask for a quote", note: "Final price confirmed with our team.", plans: [
    { title: "One shop", label: "Start with your core workflow", features: ["Customers and vehicles", "Estimates and invoices", "Date and mileage reminders"] },
    { title: "Your team", label: "Connect the whole workshop", features: ["Role-based workspaces", "Mechanic tablet interface", "Parts stock and ledger"] },
    { title: "Your rollout", label: "Plan the next step together", features: ["Telegram Mini App", "Shop QR code", "Setup consultation"] },
  ] },
  sticky: { label: "14-day trial · By request", button: "Request trial" },
};

type LandingCopy = typeof en;

const uz: LandingCopy = {
  hero: { eyebrow: "SERVISINGIZ. YAGONA TIZIM.", title: "Har bir ish.", accent: "Nazorat ostida.", detail: "Avtolar, jamoa, to‘lovlar — bir joyda.", demo: "Demoni ko‘rish", contact: "Bog‘lanish", note: "Namunaviy ma’lumot · Hisobsiz", shopLabel: "Servis turini tanlang" },
  shops: [
    { label: "Avtoservis", job: "Tormoz tekshiruvi", detail: "Tekshiruv → smeta → ta’mirlash" },
    { label: "Shina ustaxonasi", job: "G‘ildirak balansi", detail: "Tekshiruv → balans → topshirish" },
    { label: "Deteyling", job: "Kuzovni jilolash", detail: "Tekshiruv → jilolash → topshirish" },
  ],
  vehicle: { label: "Avto kartasi", sample: "Namuna", alt: "Oq Hyundai Sonata avtomobilining studiyada olingan fotosi", console: "Servis nazorati", photoCredit: "Foto:", history: "Servis tarixi", linked: "Tarix bog‘langan", mileage: "Masofa · servis qaydlari", preview: "Buyurtma namunasi", meta: [["Mijoz", "Avto bog‘langan"], ["Xizmat", "Ish qayd etilgan"], ["Tarix", "Bir joyda"], ["Jadval", "Toshkent vaqti"]] },
  proof: ["Avto kartasi", "Buyurtmalar", "Smetalar", "Mahalliy taqvim"],
  rolesHeading: { eyebrow: "YAGONA JAMOA", title: "Har kimga o‘z ko‘rinishi." },
  rolesLabel: "Rol ko‘rinishini tanlang",
  roles: [
    { label: "Rahbar", title: "Servis holati", detail: "Barcha ishlar ko‘z oldingizda.", alt: "GarageOS rahbar paneli namunasi" },
    { label: "Qabulchi", title: "Qabul stoli", detail: "Bronlar va mijozlar bir joyda.", alt: "GarageOS servis taqvimi namunasi" },
    { label: "Mexanik", title: "Biriktirilgan ishlar", detail: "Vazifangiz va keyingi qadam aniq.", alt: "GarageOS avto servis kartasi namunasi" },
    { label: "Mijoz", title: "Sizning avtoingiz", detail: "Tarix, hisoblar va bron so‘rovlari.", alt: "Mijoz portali namunasi" },
  ],
  preview: "Interaktiv namuna", screenshot: "Ekran namunasi · Ingliz tilida", phone: { greeting: "Sizning servisingiz", vehicle: "Sizning avtoingiz", detail: "Masofa va servis tarixi", actions: ["Avtolar", "Tarix", "Hisoblar"], booking: "Keyingi tashrif", request: "Bron so‘rash" },
  capabilitiesHeading: { eyebrow: "ASOSIY IMKONIYATLAR", title: "Kamroq qog‘oz. Ko‘proq aniqlik." },
  capabilities: [
    { title: "Avto kartasi", label: "Mijoz va tarix" },
    { title: "Smetalar", label: "Avval kelishuv" },
    { title: "Jamoa ruxsatlari", label: "Rolga mos ko‘rinish" },
    { title: "Mahalliy taqvim", label: "Toshkent vaqtida" },
    { title: "Eslatmalar", label: "Sana va masofa" },
    { title: "Ehtiyot qismlar", label: "Ombor nazoratda" },
  ],
  workflowHeading: { eyebrow: "YAGONA JARAYON", title: "Qabuldan topshirishgacha." },
  workflow: [["Qabul", "Mijoz va avto"], ["Tekshiruv", "Ishni qayd etish"], ["Tasdiq", "Smetani kelishish"], ["Yakun", "Ishni topshirish"], ["Hisob", "To‘lovni qayd etish"]],
  estimate: { title: "Bir bosishda tasdiq", label: "Smeta namunasini sinang", item: "Tormoz tekshiruvi", amount: "250 000 so‘m", pending: "Tasdiq kutilmoqda", approved: "Tasdiqlandi · faqat namuna", approve: "Smetani tasdiqlash", reset: "Qayta sinash", disclaimer: "Namuna · Ma’lumot saqlanmaydi" },
  passport: { eyebrow: "AVTO PASPORTI", title: "Har tashrif tarixda.", detail: "Masofa. Ta’mirlash. Yagona servis tarixi.", alt: "Avtomobil servis tarixi va texnik xizmat namunasi" },
  pricing: { eyebrow: "SIZNING SERVISINGIZ", title: "Sizga mos yechim.", currency: "Narx so‘rovi valyutasi", onRequest: "Kelishiladi", quote: "Narx so‘rash", note: "Yakuniy narx jamoamiz bilan kelishiladi.", plans: [
    { title: "Bitta servis", label: "Asosiy jarayondan boshlang", features: ["Mijozlar va avtolar", "Smeta va hisoblar", "Sana va masofa eslatmalari"] },
    { title: "Jamoangiz", label: "Ustaxonani birlashtiring", features: ["Rolga mos ish maydoni", "Mexanik uchun planshet ko‘rinishi", "Ombor va buxgalteriya"] },
    { title: "Joriy etish", label: "Keyingi qadamni birga rejalaymiz", features: ["Telegram Mini App", "Servis QR kodi", "Sozlash bo‘yicha maslahat"] },
  ] },
  sticky: { label: "14 kunlik sinov · So‘rov orqali", button: "Sinov so‘rash" },
};

const ru: LandingCopy = {
  hero: { eyebrow: "ВАШ СЕРВИС. ОДНА СИСТЕМА.", title: "Каждая работа.", accent: "Под контролем.", detail: "Авто, команда, платежи — вместе.", demo: "Смотреть демо", contact: "Связаться", note: "Пример данных · Без регистрации", shopLabel: "Выберите тип сервиса" },
  shops: [
    { label: "Автосервис", job: "Проверка тормозов", detail: "Осмотр → смета → ремонт" },
    { label: "Шиномонтаж", job: "Балансировка колёс", detail: "Проверка → балансировка → выдача" },
    { label: "Детейлинг", job: "Полировка кузова", detail: "Осмотр → полировка → выдача" },
  ],
  vehicle: { label: "Карточка авто", sample: "Пример", alt: "Студийная фотография белого Hyundai Sonata", console: "Обзор сервиса", photoCredit: "Фото:", history: "История обслуживания", linked: "История связана", mileage: "Пробег · записи сервиса", preview: "Пример заказ-наряда", meta: [["Клиент", "Авто привязано"], ["Услуга", "Работа записана"], ["История", "Всё вместе"], ["Расписание", "Время Ташкента"]] },
  proof: ["Карточки авто", "Заказ-наряды", "Сметы", "Местное время"],
  rolesHeading: { eyebrow: "ОДНА КОМАНДА", title: "Каждому — свой экран." },
  rolesLabel: "Выберите роль",
  roles: [
    { label: "Руководитель", title: "Обзор сервиса", detail: "Все процессы перед глазами.", alt: "Пример панели руководителя GarageOS" },
    { label: "Приёмщик", title: "Приём клиентов", detail: "Записи и клиенты вместе.", alt: "Пример календаря сервиса GarageOS" },
    { label: "Механик", title: "Назначенные работы", detail: "Ваши задачи. Понятный следующий шаг.", alt: "Пример сервисной карточки авто GarageOS" },
    { label: "Клиент", title: "Ваш автомобиль", detail: "История, счета и заявки на запись.", alt: "Пример личного кабинета клиента" },
  ],
  preview: "Интерактивный пример", screenshot: "Пример экрана · На английском", phone: { greeting: "Ваш сервис", vehicle: "Ваш автомобиль", detail: "Пробег и история обслуживания", actions: ["Авто", "История", "Счета"], booking: "Следующий визит", request: "Запросить запись" },
  capabilitiesHeading: { eyebrow: "ГЛАВНОЕ", title: "Меньше бумаг. Больше ясности." },
  capabilities: [
    { title: "Карточки авто", label: "Клиент и история" },
    { title: "Сметы", label: "Сначала согласие" },
    { title: "Доступ команды", label: "Каждому своё" },
    { title: "Календарь", label: "Время Ташкента" },
    { title: "Напоминания", label: "Дата и пробег" },
    { title: "Запчасти", label: "Склад под рукой" },
  ],
  workflowHeading: { eyebrow: "ОДИН ПРОЦЕСС", title: "От приёмки до выдачи." },
  workflow: [["Приёмка", "Клиент и автомобиль"], ["Осмотр", "Запись работ"], ["Согласование", "Утверждение сметы"], ["Завершение", "Выдача автомобиля"], ["Счёт", "Запись оплаты"]],
  estimate: { title: "Одно нажатие", label: "Попробуйте согласовать смету", item: "Проверка тормозов", amount: "250 000 сум", pending: "Ожидает согласования", approved: "Согласовано · только пример", approve: "Согласовать смету", reset: "Попробовать снова", disclaimer: "Пример · Данные не сохраняются" },
  passport: { eyebrow: "ПАСПОРТ АВТО", title: "Каждый визит в истории.", detail: "Пробег. Ремонт. Единая история обслуживания.", alt: "Пример истории обслуживания и состояния автомобиля" },
  pricing: { eyebrow: "ВАШ ФОРМАТ", title: "Под задачи сервиса.", currency: "Валюта предложения", onRequest: "По запросу", quote: "Запросить цену", note: "Итоговую цену подтвердит наша команда.", plans: [
    { title: "Один сервис", label: "Начните с основного процесса", features: ["Клиенты и автомобили", "Сметы и счета", "Напоминания по дате и пробегу"] },
    { title: "Ваша команда", label: "Объедините всю мастерскую", features: ["Рабочие места по ролям", "Интерфейс механика для планшета", "Склад и бухгалтерия"] },
    { title: "Ваш запуск", label: "Спланируем следующий шаг вместе", features: ["Telegram Mini App", "QR-код сервиса", "Консультация по настройке"] },
  ] },
  sticky: { label: "14 дней · По заявке", button: "Запросить пробу" },
};

export const landingMessages = { uz, ru, en };
