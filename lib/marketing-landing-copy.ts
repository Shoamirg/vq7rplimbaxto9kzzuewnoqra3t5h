// Public landing copy (uz default, ru, en). Card copy stays short on purpose:
// titles ≤ 3 words, captions ≤ 6 words, no paragraphs. All figures are sample data.
const en = {
  nav: {
    home: "GarageOS home", sections: "Page sections", language: "Website language",
    showroom: "Product", roles: "Roles", passport: "Vehicle Passport", pricing: "Pricing",
    login: "Log in", ctaTrial: "14-Day Free Trial", ctaStart: "Start Free",
  },
  hero: {
    badge: "Auto Repair · Detailing · Car Wash · Tire Shops",
    title: "Run Your Entire Garage From One System.",
    subtitle: "Telegram bookings, 1-tap approvals, stock and a zero-leak ledger.",
    shopLabel: "Choose your shop", sample: "Sample data", photoCredit: "Photo:",
    alt: "Studio photograph of a white Hyundai Sonata", inspect: "Tap to inspect",
  },
  kpiLabels: ["Repeat cars via reminders", "Telegram self-booking", "Workshop bay utilization", "Unrecorded cash leaks"],
  shops: [
    { id: "repair", label: "Auto Repair", kpis: ["+24%", "15 sec", "98%", "0 UZS"], live: "01 A 123 BC: Client approved 680,000 UZS brake estimate in Telegram." },
    { id: "detailing", label: "Detailing", kpis: ["+31%", "12 sec", "92%", "0 UZS"], live: "01 A 123 BC: Client approved 1,200,000 UZS ceramic coating." },
    { id: "wash", label: "Car Wash", kpis: ["+42%", "8 sec", "96%", "0 UZS"], live: "01 A 123 BC: Car ready — pick up at bay 3." },
    { id: "tire", label: "Tire Shop", kpis: ["+36%", "10 sec", "99%", "0 UZS"], live: "01 A 123 BC: 4 tires checked into seasonal storage." },
  ],
  hotspots: [
    { id: "brakes", label: "Brakes", finding: "Pads 3 mm · Replace" },
    { id: "engine", label: "Engine", finding: "Oil in 1,800 km" },
    { id: "tires", label: "Tires", finding: "Tread 6 mm · Good" },
  ],
  assistant: {
    title: "Telegram & AI Assistant", subtitle: "Live bridge between bay and car owner",
    tiles: [["Self-Booking", "Zero phone tag"], ["Approve Quote", "1-tap in Telegram"], ["Inspection", "Photos & findings"], ["Instant Pay", "Payme · Click · Cash"]],
    live: "Live · Telegram", send: "Try Live Demo",
  },
  roles: {
    heading: "Four Screens. Built for Every Role.", label: "Choose a role",
    tabs: ["Car Owner (Telegram)", "Service Advisor", "Mechanic (Tablet)", "Garage Owner"],
    modeLabel: "Preview mode", real: "Real screen", interactive: "Interactive", realCaption: "Real GarageOS screen · demo data",
    realAlt: ["", "GarageOS calendar: weekly bay schedule", "GarageOS vehicle passport", "GarageOS owner dashboard"],
  },
  customer: {
    bookTitle: "Book in 15s", days: ["Mon 20", "Tue 21", "Wed 22"], slots: ["09:30", "10:25", "14:00"], book: "Book slot", booked: "Booked · See you!",
    healthTitle: "Vehicle Health", health: [["Brakes", "Replace"], ["Oil", "1,800 km"], ["Tires", "Good"], ["Battery", "95%"]],
    estimateItem: "Brake pads", estimateAmount: "450,000 UZS", pending: "Awaiting approval", approved: "Approved · Sample only", approve: "Approve", reset: "Undo",
    payTitle: "Receipt", methods: ["Payme", "Click", "Cash"], total: "Total", paidVia: "Paid via",
  },
  advisor: {
    calendar: "Bay Calendar", bays: ["Bay 1", "Bay 2", "Bay 3"], slot: "20 Jul · 10:25", plate: "01 A 123 BC",
    remind: "Send reminder", reminded: "Reminder sent ✓", reminderPreview: "Tomorrow 10:25 · Bay 2",
    sos: "Roadside SOS", sosDetail: "2.4 km · ETA 12 min", dispatch: "Dispatch", dispatched: "Tow on the way",
  },
  mechanic: { title: "Vehicle Analysis", health: "Health", hint: "Tap a pin", photo: "Photo attached" },
  owner: {
    title: "Revenue & Ledger", periods: ["Today", "Week", "Month"],
    revenue: ["12.4M UZS", "78.9M UZS", "326M UZS"], revenueLabel: "Revenue", leaks: "Cash leaks", occupancy: "Bay occupancy", jobs: "Jobs closed", jobCounts: ["18", "121", "486"],
  },
  flow: {
    heading: "One Job. Four Taps.", label: "Job status",
    steps: [
      { state: "Booked", title: "Mini App booking", caption: "QR check-in at the gate" },
      { state: "Inspected", title: "Photo + estimate", caption: "450,000 UZS sent to client" },
      { state: "Approved & Paid", title: "Client taps Approve", caption: "Payme · Click · Cash" },
      { state: "Returned", title: "Auto reminder", caption: "Back in 6 months" },
    ],
  },
  telemetry: {
    kicker: "DIGITAL VEHICLE PASSPORT // TELEMETRY",
    title: "Vehicle history lives in your garage—not just the mechanic's head.",
    gauge1: "System Health", gauge2: "Until Next Oil Service", km: "1,800 km",
    qrLabel: "Scan QR to preview a live Vehicle Passport in Telegram", diagram: "Top view of a sedan with service callouts",
  },
  pricing: {
    heading: "Two returning cars a month cover your entire subscription.", currencyLabel: "Price currency",
    currencies: { UZS: "UZS (Soʻm)", USD: "USD ($)" }, popular: "Most Popular", perMonth: "/ mo", cta: "Start Free",
    plans: [
      { name: "Starter", sub: "1–3 Bays", UZS: "490 000", USD: "$39", features: ["Telegram Mini App & QR", "Quotes & invoices", "Mileage reminders", "1 location"] },
      { name: "Pro Garage", sub: "Full Automation", UZS: "990 000", USD: "$79", features: ["Everything in Starter", "Double-entry ledger", "Mechanic tablet app", "Parts stock"] },
      { name: "Multi-Location", sub: "Chains & Dealerships", UZS: "2 490 000+", USD: "$199+", features: ["Everything in Pro", "Branch reports", "Central parts stock", "Priority onboarding"] },
    ],
    uzsUnit: "UZS",
  },
  sticky: { label: "14-day free trial · No card", button: "Start Free →" },
};

export type LandingCopy = typeof en;

const uz: LandingCopy = {
  nav: {
    home: "GarageOS bosh sahifa", sections: "Sahifa boʻlimlari", language: "Sayt tili",
    showroom: "Imkoniyatlar", roles: "Kim uchun", passport: "Avto-Pasport", pricing: "Narxlar",
    login: "Kirish", ctaTrial: "14 kun bepul", ctaStart: "Bepul boshlash",
  },
  hero: {
    badge: "Avtoservis · Deteyling · Moyka · Shinomontaj",
    title: "Avtoservisning barcha ishi bitta tizimda.",
    subtitle: "Bron, smeta, ombor va kassa — Telegram orqali, barchasi nazoratda.",
    shopLabel: "Servis turini tanlang", sample: "Namuna", photoCredit: "Foto:",
    alt: "Oq Hyundai Sonata avtomobilining studiya fotosi", inspect: "Bosib tekshiring",
  },
  kpiLabels: ["Qaytib keluvchi mijozlar", "Telegram orqali bron", "Bokslar bandligi", "Kassadagi yoʻqotishlar"],
  shops: [
    { id: "repair", label: "Avtoservis", kpis: ["+24%", "15 sek", "98%", "0 soʻm"], live: "01 A 123 BC: Mijoz 680 000 soʻmlik smetani Telegramda tasdiqladi." },
    { id: "detailing", label: "Deteyling", kpis: ["+31%", "12 sek", "92%", "0 soʻm"], live: "01 A 123 BC: Keramika qoplama — 1 200 000 soʻm tasdiqlandi." },
    { id: "wash", label: "Avtomoyka", kpis: ["+42%", "8 sek", "96%", "0 soʻm"], live: "01 A 123 BC: Mashina tayyor — 3-boksdan olib keting." },
    { id: "tire", label: "Shinomontaj", kpis: ["+36%", "10 sek", "99%", "0 soʻm"], live: "01 A 123 BC: 4 ta shina saqlashga qabul qilindi." },
  ],
  hotspots: [
    { id: "brakes", label: "Tormoz", finding: "Kolodka 3 mm · Almashtirish" },
    { id: "engine", label: "Dvigatel", finding: "Moy 1 800 km dan keyin" },
    { id: "tires", label: "Shinalar", finding: "Protektor 6 mm · Yaxshi" },
  ],
  assistant: {
    title: "Telegram & AI Yordamchi", subtitle: "Mijoz va ustaxona oʻrtasidagi jonli aloqa",
    tiles: [["Onlayn Bron", "Qoʻngʻiroqlarsiz"], ["Smeta Tasdiqlash", "1 bosishda"], ["Avto Diagnostika", "Foto va tarix"], ["Toʻlov Qabul Qilish", "Payme · Click · Naqd"]],
    live: "Jonli · Telegram", send: "Sinab koʻrish",
  },
  roles: {
    heading: "4 ta ekran. Har bir xodim oʻz joyida.", label: "Rolni tanlang",
    tabs: ["Mijoz (Telegram)", "Qabulxona (Master)", "Usta (Planshet)", "Rahbar (Moliya)"],
    modeLabel: "Koʻrinish", real: "Haqiqiy ekran", interactive: "Jonli namuna", realCaption: "Haqiqiy GarageOS ekrani · demo maʼlumotlar",
    realAlt: ["", "GarageOS kalendari: bokslarning haftalik jadvali", "GarageOS avtomobil pasporti", "GarageOS boshqaruv paneli"],
  },
  customer: {
    bookTitle: "15 soniyada bron", days: ["Du 20", "Se 21", "Ch 22"], slots: ["09:30", "10:25", "14:00"], book: "Bron qilish", booked: "Bron qilindi · Kutamiz!",
    healthTitle: "Avto holati", health: [["Tormoz", "Almashtirish"], ["Moy", "1 800 km"], ["Shinalar", "Yaxshi"], ["Akkumulyator", "95%"]],
    estimateItem: "Tormoz kolodkasi", estimateAmount: "450 000 soʻm", pending: "Tasdiq kutilmoqda", approved: "Tasdiqlandi · Namuna", approve: "Tasdiqlash", reset: "Bekor qilish",
    payTitle: "Chek", methods: ["Payme", "Click", "Naqd"], total: "Jami", paidVia: "Toʻlov:",
  },
  advisor: {
    calendar: "Bokslar jadvali", bays: ["1-boks", "2-boks", "3-boks"], slot: "20 iyul · 10:25", plate: "01 A 123 BC",
    remind: "Eslatma yuborish", reminded: "Eslatma yuborildi ✓", reminderPreview: "Ertaga 10:25 · 2-boks",
    sos: "Yoʻlda yordam", sosDetail: "2,4 km · 12 daqiqada", dispatch: "Yuborish", dispatched: "Evakuator yoʻlda",
  },
  mechanic: { title: "Avto tahlili", health: "Holat", hint: "Nuqtani bosing", photo: "Foto biriktirildi" },
  owner: {
    title: "Tushum va kassa", periods: ["Bugun", "Hafta", "Oy"],
    revenue: ["12,4 mln soʻm", "78,9 mln soʻm", "326 mln soʻm"], revenueLabel: "Tushum", leaks: "Kassa yoʻqotishi", occupancy: "Bokslar bandligi", jobs: "Yopilgan ishlar", jobCounts: ["18", "121", "486"],
  },
  flow: {
    heading: "Bitta ish. Toʻrt bosish.", label: "Ish holati",
    steps: [
      { state: "Bron", title: "Mini App orqali", caption: "QR bilan qabul" },
      { state: "Tekshiruv", title: "Foto + smeta", caption: "450 000 soʻm mijozga" },
      { state: "Tasdiq va toʻlov", title: "Mijoz tasdiqlaydi", caption: "Payme · Click · Naqd" },
      { state: "Qaytish", title: "Avto eslatma", caption: "6 oydan keyin qaytadi" },
    ],
  },
  telemetry: {
    kicker: "RAQAMLI AVTO-PASSPORT // DIAGNOSTIKA",
    title: "Mashina tarixi ustaning xotirasida emas, bazada qoladi.",
    gauge1: "Texnik holat", gauge2: "Keyingi moy almashtirish", km: "1 800 km",
    qrLabel: "Kamerani yoʻnaltiring — Telegramda namuna pasportni oching", diagram: "Sedan sxemasi va servis belgilari",
  },
  pricing: {
    heading: "Oyiga 2 ta qaytgan mashina obunani toʻliq qoplaydi.", currencyLabel: "Narx valyutasi",
    currencies: { UZS: "UZS (Soʻm)", USD: "USD ($)" }, popular: "Eng ommabop", perMonth: "/ oy", cta: "Bepul boshlash",
    plans: [
      { name: "Start", sub: "1–3 boks uchun", UZS: "490 000", USD: "$39", features: ["Telegram Mini App va QR", "Smeta va hisoblar", "Probeg eslatmalari", "1 filial"] },
      { name: "Pro Servis", sub: "Toʻliq avtomat", UZS: "990 000", USD: "$79", features: ["Startdagi hammasi", "Kassa va qarzdorlik", "Usta planshet ilovasi", "Ehtiyot qismlar ombori"] },
      { name: "Tarmoq", sub: "Koʻp filialli servislar", UZS: "2 490 000+", USD: "$199+", features: ["Prodagi hammasi", "Filiallar hisoboti", "Markaziy ombor", "Ustuvor ulash"] },
    ],
    uzsUnit: "soʻm",
  },
  sticky: { label: "14 kun bepul · Kartasiz", button: "Ulash →" },
};

const ru: LandingCopy = {
  nav: {
    home: "Главная GarageOS", sections: "Разделы страницы", language: "Язык сайта",
    showroom: "Возможности", roles: "Роли", passport: "Авто-Паспорт", pricing: "Тарифы",
    login: "Войти", ctaTrial: "14 дней бесплатно", ctaStart: "Начать бесплатно",
  },
  hero: {
    badge: "Автосервис · Детейлинг · Мойка · Шиномонтаж",
    title: "Весь автосервис в одной системе.",
    subtitle: "Запись в Telegram, сметы, склад и касса без утечек.",
    shopLabel: "Выберите тип сервиса", sample: "Пример", photoCredit: "Фото:",
    alt: "Студийная фотография белого Hyundai Sonata", inspect: "Нажмите для осмотра",
  },
  kpiLabels: ["Возврат клиентов по пробегу", "Запись через Telegram", "Загрузка постов", "Утечек мимо кассы"],
  shops: [
    { id: "repair", label: "Автосервис", kpis: ["+24%", "15 сек", "98%", "0 сум"], live: "01 A 123 BC: Клиент одобрил смету на 680 000 сум в Telegram." },
    { id: "detailing", label: "Детейлинг", kpis: ["+31%", "12 сек", "92%", "0 сум"], live: "01 A 123 BC: Клиент одобрил керамику на 1 200 000 сум." },
    { id: "wash", label: "Автомойка", kpis: ["+42%", "8 сек", "96%", "0 сум"], live: "01 A 123 BC: Машина готова — заберите с поста 3." },
    { id: "tire", label: "Шиномонтаж", kpis: ["+36%", "10 сек", "99%", "0 сум"], live: "01 A 123 BC: 4 шины приняты на хранение." },
  ],
  hotspots: [
    { id: "brakes", label: "Тормоза", finding: "Колодки 3 мм · Замена" },
    { id: "engine", label: "Двигатель", finding: "Масло через 1 800 км" },
    { id: "tires", label: "Шины", finding: "Протектор 6 мм · Норма" },
  ],
  assistant: {
    title: "Telegram и AI Ассистент", subtitle: "Прямая связь сервиса с клиентом",
    tiles: [["Онлайн-запись", "Без звонков"], ["Согласование", "Смета в 1 клик"], ["Осмотр авто", "Фото и дефекты"], ["Оплата счёта", "Payme · Click · Нал"]],
    live: "Онлайн · Telegram", send: "Демо вживую",
  },
  roles: {
    heading: "4 экрана. Каждый на своём месте.", label: "Выберите роль",
    tabs: ["Клиент (Telegram)", "Приёмщик", "Механик (Планшет)", "Владелец (Финансы)"],
    modeLabel: "Режим просмотра", real: "Реальный экран", interactive: "Интерактив", realCaption: "Настоящий экран GarageOS · демо-данные",
    realAlt: ["", "Календарь GarageOS: недельное расписание постов", "Паспорт автомобиля в GarageOS", "Панель руководителя GarageOS"],
  },
  customer: {
    bookTitle: "Запись за 15 сек", days: ["Пн 20", "Вт 21", "Ср 22"], slots: ["09:30", "10:25", "14:00"], book: "Записаться", booked: "Записаны · Ждём вас!",
    healthTitle: "Состояние авто", health: [["Тормоза", "Замена"], ["Масло", "1 800 км"], ["Шины", "Норма"], ["АКБ", "95%"]],
    estimateItem: "Тормозные колодки", estimateAmount: "450 000 сум", pending: "Ожидает согласования", approved: "Согласовано · Пример", approve: "Согласовать", reset: "Отменить",
    payTitle: "Чек", methods: ["Payme", "Click", "Наличные"], total: "Итого", paidVia: "Оплата:",
  },
  advisor: {
    calendar: "Календарь постов", bays: ["Пост 1", "Пост 2", "Пост 3"], slot: "20 июл · 10:25", plate: "01 A 123 BC",
    remind: "Напомнить", reminded: "Напоминание отправлено ✓", reminderPreview: "Завтра 10:25 · Пост 2",
    sos: "Помощь на дороге", sosDetail: "2,4 км · через 12 мин", dispatch: "Отправить", dispatched: "Эвакуатор в пути",
  },
  mechanic: { title: "Анализ авто", health: "Состояние", hint: "Нажмите на точку", photo: "Фото приложено" },
  owner: {
    title: "Выручка и касса", periods: ["Сегодня", "Неделя", "Месяц"],
    revenue: ["12,4 млн сум", "78,9 млн сум", "326 млн сум"], revenueLabel: "Выручка", leaks: "Утечки кассы", occupancy: "Загрузка постов", jobs: "Закрыто работ", jobCounts: ["18", "121", "486"],
  },
  flow: {
    heading: "Один заказ. Четыре касания.", label: "Статус заказа",
    steps: [
      { state: "Запись", title: "Через Mini App", caption: "QR-приёмка на въезде" },
      { state: "Осмотр", title: "Фото + смета", caption: "450 000 сум клиенту" },
      { state: "Согласовано и оплачено", title: "Клиент согласует", caption: "Payme · Click · Нал" },
      { state: "Возврат", title: "Авто-напоминание", caption: "Снова через 6 месяцев" },
    ],
  },
  telemetry: {
    kicker: "ЦИФРОВОЙ ПАСПОРТ АВТО // ТЕЛЕМЕТРИЯ",
    title: "История машины остаётся в базе сервиса, а не в голове механика.",
    gauge1: "Состояние узлов", gauge2: "До замены масла", km: "1 800 км",
    qrLabel: "Наведите камеру — откройте пример паспорта в Telegram", diagram: "Схема седана с отметками сервиса",
  },
  pricing: {
    heading: "Два вернувшихся клиента в месяц полностью окупают подписку.", currencyLabel: "Валюта цены",
    currencies: { UZS: "UZS (Сум)", USD: "USD ($)" }, popular: "Выбор СТО", perMonth: "/ мес", cta: "Начать бесплатно",
    plans: [
      { name: "Старт", sub: "1–3 поста", UZS: "490 000", USD: "$39", features: ["Telegram Mini App и QR", "Сметы и счета", "Напоминания по пробегу", "1 филиал"] },
      { name: "Про Сервис", sub: "Полный автомат", UZS: "990 000", USD: "$79", features: ["Всё из Старта", "Касса и долги", "Планшет механика", "Склад запчастей"] },
      { name: "Сеть СТО", sub: "Несколько филиалов", UZS: "2 490 000+", USD: "$199+", features: ["Всё из Про", "Отчёты по филиалам", "Центральный склад", "Приоритетный запуск"] },
    ],
    uzsUnit: "сум",
  },
  sticky: { label: "14 дней бесплатно · Без карты", button: "Подключить →" },
};

export const landingMessages = { uz, ru, en };
