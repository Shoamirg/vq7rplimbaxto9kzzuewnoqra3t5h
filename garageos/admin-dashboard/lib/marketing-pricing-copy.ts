// /pricing page copy (uz default, ru, en). Plan names, prices, the "popular"
// badge and the CTA label come from the landing copy (`landingMessages[locale].pricing`)
// so the two pages can never disagree; this file holds the page-only detail.
// Inline markup: `**bold**` and `[label](/path)` (see components/marketing/pages/rich-text.tsx).
type Cell = boolean | string;
type Row = [string, Cell, Cell, Cell];

const en = {
  eyebrow: "Pricing",
  title: "Pricing that grows with the shop",
  sub: "Straightforward monthly pricing per location. Start with one shop and scale to a whole network — 14-day free trial, no card, no setup fees.",
  plans: [
    { desc: "A 1–3 bay shop getting organized.",
      features: ["Telegram Mini App & QR", "Quotes & invoices", "Mileage reminders", "Customers & vehicle records", "Vehicle health & passports", "1 location, up to 3 staff seats"] },
    { desc: "Busy shops that live in the platform daily.",
      features: ["Everything in Starter", "Double-entry ledger", "Mechanic tablet app", "Parts stock", "Operations & unified inbox", "Reports & analytics", "Unlimited staff seats, priority support"] },
    { desc: "Chains running several sites on one system.",
      features: ["Everything in Pro", "Branch reports", "Central parts stock", "Priority onboarding & data import", "Location branding & custom domain", "Dedicated success contact"] },
  ],
  note: "Prices per location, per month. 14-day free trial, no card required. Annual billing available — book a demo to confirm your plan.",
  compareTitle: "Compare plans",
  featureHeader: "Feature",
  included: "Included",
  notIncluded: "Not included",
  comparison: [
    { group: "Core", rows: [
      ["Scheduling & calendar board", true, true, true],
      ["Customers & vehicles", true, true, true],
      ["Vehicle maintenance health & service record", true, true, true],
      ["Quotes, invoices & payments", true, true, true],
      ["Telegram Mini App & QR", true, true, true],
      ["Mileage reminders", true, true, true],
      ["Staff seats", "3", "Unlimited", "Unlimited"],
    ] as Row[] },
    { group: "Operate & engage", rows: [
      ["Double-entry ledger", false, true, true],
      ["Mechanic tablet app", false, true, true],
      ["Parts stock", false, true, true],
      ["Operations & dispatch", false, true, true],
      ["Unified inbox", false, true, true],
      ["Reports & analytics", false, true, true],
    ] as Row[] },
    { group: "Scale", rows: [
      ["Locations", "1", "1", "Multiple"],
      ["Branch reports & central stock", false, false, true],
      ["White-label branding", "Basic", "Basic", "Full"],
      ["Custom domain", false, false, true],
      ["Onboarding & data import", "Self-serve", "Self-serve", "Priority"],
      ["Support", "Email", "Priority", "Dedicated"],
    ] as Row[] },
  ],
  faqTitle: "Pricing questions",
  faq: [
    ["How is GarageOS priced?", "Per location, per month. Each physical shop is one location; add more as you grow. Book a demo and we’ll confirm the right plan for your operation."],
    ["Is there a setup fee?", "No. There are no setup fees to get started. The Multi-Location plan includes priority onboarding and data import at no extra charge."],
    ["Can I try it first?", "Yes — start a 14-day free trial, no card required. You can also explore the full platform right now in our live, read-only [demo](/demo), no signup required."],
    ["Do you support multiple locations?", "Yes. The Multi-Location plan runs several sites on one system with branch reports, central parts stock and per-location branding."],
    ["What about my customer and vehicle data?", "It’s yours. You can export it at any time, and every tenant’s data is isolated by design. See the [Security page](/security) for details."],
  ] as Array<[string, string]>,
};

export type PricingCopy = typeof en;

const uz: PricingCopy = {
  eyebrow: "Narxlar",
  title: "Servisingiz bilan birga oʻsadigan narxlar",
  sub: "Har bir filial uchun oddiy oylik toʻlov. Bitta servisdan boshlab butun tarmoqqacha kengaying — 14 kun bepul, kartasiz, ulanish toʻlovisiz.",
  plans: [
    { desc: "1–3 boksli servisda tartib oʻrnatish uchun.",
      features: ["Telegram Mini App va QR", "Smeta va hisoblar", "Probeg eslatmalari", "Mijozlar va avtomobillar bazasi", "Avto holati va pasportlar", "1 filial, 3 tagacha xodim"] },
    { desc: "Har kuni tizimda ishlaydigan band servislar uchun.",
      features: ["Startdagi hammasi", "Kassa va qarzdorlik", "Usta planshet ilovasi", "Ehtiyot qismlar ombori", "Operatsiyalar va yagona chat", "Hisobotlar va tahlil", "Cheksiz xodimlar, ustuvor yordam"] },
    { desc: "Bir nechta filialni bitta tizimda yurituvchi tarmoqlar uchun.",
      features: ["Prodagi hammasi", "Filiallar hisoboti", "Markaziy ombor", "Ustuvor ulash va ma’lumotlarni koʻchirish", "Filial brendi va oʻz domeningiz", "Shaxsiy menejer"] },
  ],
  note: "Narxlar bitta filial uchun, oyiga. 14 kun bepul, karta talab qilinmaydi. Yillik toʻlov ham mavjud — mos tarifni aniqlash uchun demo soʻrang.",
  compareTitle: "Tariflarni solishtirish",
  featureHeader: "Imkoniyat",
  included: "Mavjud",
  notIncluded: "Mavjud emas",
  comparison: [
    { group: "Asosiy", rows: [
      ["Ish jadvali va boks taqvimi", true, true, true],
      ["Mijozlar va avtomobillar", true, true, true],
      ["Avto texnik holati va servis tarixi", true, true, true],
      ["Smeta, hisob va toʻlovlar", true, true, true],
      ["Telegram Mini App va QR", true, true, true],
      ["Probeg eslatmalari", true, true, true],
      ["Xodimlar soni", "3", "Cheksiz", "Cheksiz"],
    ] },
    { group: "Ish va mijozlar bilan aloqa", rows: [
      ["Kassa va qarzdorlik (ikki tomonlama yozuv)", false, true, true],
      ["Usta planshet ilovasi", false, true, true],
      ["Ehtiyot qismlar ombori", false, true, true],
      ["Operatsiyalar va dispetcherlik", false, true, true],
      ["Yagona chat", false, true, true],
      ["Hisobotlar va tahlil", false, true, true],
    ] },
    { group: "Kengayish", rows: [
      ["Filiallar", "1", "1", "Bir nechta"],
      ["Filiallar hisoboti va markaziy ombor", false, false, true],
      ["Oʻz brendingiz", "Asosiy", "Asosiy", "Toʻliq"],
      ["Oʻz domeningiz", false, false, true],
      ["Ulash va ma’lumotlarni koʻchirish", "Mustaqil", "Mustaqil", "Ustuvor"],
      ["Yordam", "Email", "Ustuvor", "Shaxsiy menejer"],
    ] },
  ],
  faqTitle: "Narxlar boʻyicha savollar",
  faq: [
    ["GarageOS narxi qanday hisoblanadi?", "Har bir filial uchun oylik toʻlov. Har bir alohida servis — bitta filial; oʻsgan sari yangilarini qoʻshasiz. Demo soʻrang — sizga mos tarifni birga aniqlaymiz."],
    ["Ulanish uchun toʻlov bormi?", "Yoʻq. Boshlash uchun hech qanday ulanish toʻlovi yoʻq. Tarmoq tarifida ustuvor ulash va ma’lumotlarni koʻchirish qoʻshimcha haqsiz."],
    ["Avval sinab koʻrsam boʻladimi?", "Ha — 14 kun bepul foydalaning, karta kerak emas. Hoziroq roʻyxatdan oʻtmasdan, faqat koʻrish rejimidagi [jonli demo](/demo)da butun platformani ham koʻrishingiz mumkin."],
    ["Bir nechta filialni qoʻllab-quvvatlaysizmi?", "Ha. Tarmoq tarifi bir nechta filialni bitta tizimda yuritadi: filiallar hisoboti, markaziy ombor va har bir filial uchun oʻz brendi."],
    ["Mijozlar va avtomobillar ma’lumotlari-chi?", "Ular sizga tegishli. Istalgan vaqtda eksport qilishingiz mumkin, har bir servis ma’lumotlari esa arxitektura darajasida ajratilgan. Batafsil — [Xavfsizlik sahifasi](/security)da."],
  ],
};

const ru: PricingCopy = {
  eyebrow: "Тарифы",
  title: "Тарифы, которые растут вместе с сервисом",
  sub: "Понятная ежемесячная оплата за каждый филиал. Начните с одного сервиса и вырастите до целой сети — 14 дней бесплатно, без карты и без платы за подключение.",
  plans: [
    { desc: "Для сервиса на 1–3 поста, который наводит порядок.",
      features: ["Telegram Mini App и QR", "Сметы и счета", "Напоминания по пробегу", "База клиентов и автомобилей", "Состояние авто и паспорта", "1 филиал, до 3 сотрудников"] },
    { desc: "Для загруженных сервисов, которые работают в системе каждый день.",
      features: ["Всё из Старта", "Касса и долги", "Планшет механика", "Склад запчастей", "Операции и единый чат", "Отчёты и аналитика", "Сотрудники без лимита, приоритетная поддержка"] },
    { desc: "Для сетей, которые ведут несколько филиалов в одной системе.",
      features: ["Всё из Про", "Отчёты по филиалам", "Центральный склад", "Приоритетный запуск и перенос данных", "Брендинг филиалов и свой домен", "Персональный менеджер"] },
  ],
  note: "Цены указаны за один филиал в месяц. 14 дней бесплатно, карта не нужна. Доступна годовая оплата — закажите демо, чтобы подобрать тариф.",
  compareTitle: "Сравнение тарифов",
  featureHeader: "Возможность",
  included: "Включено",
  notIncluded: "Не включено",
  comparison: [
    { group: "Основное", rows: [
      ["Расписание и календарь постов", true, true, true],
      ["Клиенты и автомобили", true, true, true],
      ["Техсостояние авто и сервисная история", true, true, true],
      ["Сметы, счета и оплаты", true, true, true],
      ["Telegram Mini App и QR", true, true, true],
      ["Напоминания по пробегу", true, true, true],
      ["Сотрудники", "3", "Без лимита", "Без лимита"],
    ] },
    { group: "Работа и клиенты", rows: [
      ["Касса и долги (двойная запись)", false, true, true],
      ["Планшет механика", false, true, true],
      ["Склад запчастей", false, true, true],
      ["Операции и диспетчеризация", false, true, true],
      ["Единый чат", false, true, true],
      ["Отчёты и аналитика", false, true, true],
    ] },
    { group: "Масштаб", rows: [
      ["Филиалы", "1", "1", "Несколько"],
      ["Отчёты по филиалам и центральный склад", false, false, true],
      ["Свой брендинг", "Базовый", "Базовый", "Полный"],
      ["Свой домен", false, false, true],
      ["Подключение и перенос данных", "Самостоятельно", "Самостоятельно", "Приоритетно"],
      ["Поддержка", "Email", "Приоритетная", "Персональная"],
    ] },
  ],
  faqTitle: "Вопросы о тарифах",
  faq: [
    ["Как формируется цена GarageOS?", "За каждый филиал, помесячно. Каждый отдельный сервис — один филиал; добавляйте новые по мере роста. Закажите демо — подберём подходящий тариф."],
    ["Есть ли плата за подключение?", "Нет. Платы за подключение нет. В тарифе «Сеть СТО» приоритетный запуск и перенос данных — без доплаты."],
    ["Можно сначала попробовать?", "Да — 14 дней бесплатно, карта не нужна. А прямо сейчас всю платформу можно изучить в [живом демо](/demo) без регистрации, в режиме только для чтения."],
    ["Поддерживаете несколько филиалов?", "Да. Тариф «Сеть СТО» объединяет несколько филиалов в одной системе: отчёты по филиалам, центральный склад и брендинг каждого филиала."],
    ["А как же данные моих клиентов и автомобилей?", "Они принадлежат вам. Их можно выгрузить в любой момент, а данные каждого сервиса изолированы на уровне архитектуры. Подробнее — на [странице безопасности](/security)."],
  ],
};

export const pricingMessages = { uz, ru, en };
