// /security and /docs page copy (uz default, ru, en). English is the typed source.
// Inline markup: `**bold**` and `[label](/path)` (see components/marketing/pages/rich-text.tsx).
// Pillar order matches the icon order in components/marketing/pages/security-content.tsx.
type Section = { id: string; title: string; paragraphs: string[] };

const securityEn = {
  eyebrow: "Security & trust",
  title: "Built for real customer data",
  sub: "Garages run on trust — with their customers, and with the software that holds their business. Here’s how GarageOS earns it.",
  pillars: [
    { title: "Multi-tenant isolation", body: "Every garage’s data is scoped to its own tenant at the data layer — cross-tenant reads and writes are impossible by construction, not just by convention." },
    { title: "Encrypted in transit", body: "All traffic is served over HTTPS with automatic certificate management and HSTS. Nothing moves between browser and server in the clear." },
    { title: "Hardened authentication", body: "Passwords are hashed with bcrypt; sessions use signed, expiring tokens. Login and sensitive endpoints are rate-limited to blunt brute-force attempts." },
    { title: "Audit trail", body: "An append-only audit log records security-relevant actions — logins, successes and failures — with source IP, so activity is always accountable." },
    { title: "Automated backups", body: "The database is backed up nightly with retention. Backups are verified by an automated restore test, because a backup you’ve never restored isn’t a backup." },
    { title: "You own your data", body: "Your customer, vehicle, and financial records are yours. Export them at any time. We never sell data or use it to train anything." },
  ],
  sections: [
    { id: "architecture", title: "Isolation by architecture", paragraphs: ["GarageOS is multi-tenant from the ground up. Every business record carries its owning service center, and the data layer refuses any query that isn’t scoped to the authenticated tenant. A garage can never see — or affect — another garage’s data, even in the event of an application bug."] },
    { id: "access", title: "Access & accountability", paragraphs: ["Staff authenticate with hashed credentials and short-lived, signed session tokens. Authentication and write-heavy endpoints are rate-limited. A tamper-evident, append-only **audit log** records logins and privileged actions with their source, so you always have an answer to “who did what, and when.”"] },
    { id: "continuity", title: "Backups & disaster recovery", paragraphs: ["The production database is backed up automatically every night and retained. Crucially, those backups are **restore-tested** on a schedule — restored into a throwaway environment and checked for integrity — so recovery is a proven procedure, not a hope. The whole platform is defined as infrastructure-as-code and can be rebuilt from a clean host in minutes."] },
    { id: "data", title: "Data ownership & privacy", paragraphs: ["Your data belongs to you. You can export your customers, vehicles, and financial records at any time, and you can ask us to delete your workspace and its data on termination. We do not sell your data or use it to train machine-learning models. See our [Privacy Policy](/privacy) for the full statement."] },
  ] as Section[],
  callout: "Running a security review or need a signed agreement (DPA, custom terms)? Book a demo and we’ll walk your team through the architecture and paperwork.",
  ctaTitle: "Put it to the test",
  ctaBody: "Explore the platform in the live demo, or book a call to review the security architecture with your team.",
};

export type SecurityCopy = typeof securityEn;

const securityUz: SecurityCopy = {
  eyebrow: "Xavfsizlik va ishonch",
  title: "Haqiqiy mijoz ma’lumotlari uchun yaratilgan",
  sub: "Avtoservis ishonch bilan yashaydi — mijozlar bilan ham, biznesi saqlanadigan dastur bilan ham. GarageOS bu ishonchni qanday oqlaydi — quyida.",
  pillars: [
    { title: "Servislar bir-biridan ajratilgan", body: "Har bir servis ma’lumotlari ma’lumotlar qatlamida faqat oʻziga bogʻlangan — boshqa servis ma’lumotlarini oʻqish yoki yozish kelishuv bilan emas, tizim tuzilishining oʻzi bilan imkonsiz." },
    { title: "Shifrlangan ulanish", body: "Barcha trafik HTTPS orqali uzatiladi, sertifikatlar avtomatik boshqariladi, HSTS yoqilgan. Brauzer va server oʻrtasida hech narsa ochiq holda uzatilmaydi." },
    { title: "Mustahkam autentifikatsiya", body: "Parollar bcrypt bilan xeshlanadi; sessiyalar imzolangan, muddati cheklangan tokenlardan foydalanadi. Kirish va muhim endpointlarda soʻrovlar soni cheklangan — parol tanlash urinishlariga qarshi." },
    { title: "Audit jurnali", body: "Faqat qoʻshib boriladigan audit jurnali xavfsizlikka oid harakatlarni — muvaffaqiyatli va muvaffaqiyatsiz kirishlarni — manba IP manzili bilan qayd etadi, shu bois har bir harakat uchun javobgar aniq." },
    { title: "Avtomatik zaxira nusxalar", body: "Ma’lumotlar bazasi har kecha zaxiralanadi va saqlanadi. Zaxiralar avtomatik tiklash testi bilan tekshiriladi, chunki hech qachon tiklab koʻrilmagan zaxira — zaxira emas." },
    { title: "Ma’lumotlar sizniki", body: "Mijozlar, avtomobillar va moliyaviy yozuvlaringiz sizga tegishli. Ularni istalgan vaqtda eksport qiling. Biz ma’lumotlarni hech qachon sotmaymiz va ulardan hech narsani oʻqitishda foydalanmaymiz." },
  ],
  sections: [
    { id: "architecture", title: "Arxitektura darajasida ajratish", paragraphs: ["GarageOS boshidanoq koʻp mijozli (multi-tenant) tizim sifatida qurilgan. Har bir biznes yozuvida u tegishli servis markazi saqlanadi, ma’lumotlar qatlami esa tizimga kirgan servisga bogʻlanmagan har qanday soʻrovni rad etadi. Hatto ilovada xato yuz bersa ham, bir servis boshqa servis ma’lumotlarini koʻra olmaydi va ularga ta’sir qila olmaydi."] },
    { id: "access", title: "Kirish va javobgarlik", paragraphs: ["Xodimlar xeshlangan login ma’lumotlari va qisqa muddatli, imzolangan sessiya tokenlari bilan kiradi. Autentifikatsiya va koʻp yozuv qiladigan endpointlarda soʻrovlar soni cheklangan. Har qanday aralashuv izini qoldiradigan, faqat qoʻshib boriladigan **audit jurnali** kirishlar va imtiyozli harakatlarni manbasi bilan qayd etadi — “kim, nima va qachon qildi” degan savolga doim javob bor."] },
    { id: "continuity", title: "Zaxira nusxalar va avariyadan tiklash", paragraphs: ["Ishchi ma’lumotlar bazasi har kecha avtomatik zaxiralanadi va saqlanadi. Eng muhimi, bu zaxiralar jadval boʻyicha **tiklash testidan** oʻtkaziladi — vaqtinchalik muhitga tiklanib, yaxlitligi tekshiriladi — shuning uchun tiklash umid emas, sinalgan jarayondir. Butun platforma kod koʻrinishidagi infratuzilma (infrastructure-as-code) sifatida tavsiflangan va toza serverda bir necha daqiqada qayta qurilishi mumkin."] },
    { id: "data", title: "Ma’lumotlarga egalik va maxfiylik", paragraphs: ["Ma’lumotlaringiz sizga tegishli. Mijozlar, avtomobillar va moliyaviy yozuvlarni istalgan vaqtda eksport qilishingiz, shartnoma tugaganda esa ish maydoningiz va undagi ma’lumotlarni oʻchirishni soʻrashingiz mumkin. Biz ma’lumotlaringizni sotmaymiz va ulardan mashinali oʻqitish modellarini oʻqitishda foydalanmaymiz. Toʻliq bayon — [Maxfiylik siyosati](/privacy)da."] },
  ],
  callout: "Xavfsizlik tekshiruvini oʻtkazyapsizmi yoki imzolangan kelishuv (DPA, maxsus shartlar) kerakmi? Demo soʻrang — jamoangizga arxitektura va hujjatlarni batafsil koʻrsatib beramiz.",
  ctaTitle: "Oʻzingiz sinab koʻring",
  ctaBody: "Platformani jonli demoda oʻrganing yoki xavfsizlik arxitekturasini jamoangiz bilan koʻrib chiqish uchun qoʻngʻiroq belgilang.",
};

const securityRu: SecurityCopy = {
  eyebrow: "Безопасность и доверие",
  title: "Создано для реальных данных клиентов",
  sub: "Автосервис держится на доверии — клиентов и к программе, в которой живёт бизнес. Вот как GarageOS его заслуживает.",
  pillars: [
    { title: "Изоляция сервисов", body: "Данные каждого сервиса привязаны к своему арендатору на уровне данных — чтение и запись чужих данных невозможны по устройству системы, а не по договорённости." },
    { title: "Шифрование при передаче", body: "Весь трафик идёт по HTTPS с автоматическим управлением сертификатами и HSTS. Между браузером и сервером ничего не передаётся в открытом виде." },
    { title: "Надёжная аутентификация", body: "Пароли хешируются bcrypt; сессии используют подписанные токены с ограниченным сроком действия. Вход и чувствительные эндпоинты ограничены по частоте запросов, чтобы гасить перебор паролей." },
    { title: "Журнал аудита", body: "Журнал аудита, в который записи только добавляются, фиксирует важные для безопасности действия — успешные и неуспешные входы — с IP-адресом источника, поэтому у каждого действия есть ответственный." },
    { title: "Автоматические резервные копии", body: "База данных копируется каждую ночь, копии хранятся. Они проверяются автоматическим тестом восстановления — ведь копия, которую ни разу не восстанавливали, не копия." },
    { title: "Данные принадлежат вам", body: "Клиенты, автомобили и финансовые записи — ваши. Выгружайте их в любой момент. Мы никогда не продаём данные и не используем их для обучения чего-либо." },
  ],
  sections: [
    { id: "architecture", title: "Изоляция на уровне архитектуры", paragraphs: ["GarageOS изначально построен как мультиарендная система. Каждая бизнес-запись хранит сервисный центр-владельца, а слой данных отклоняет любой запрос, не привязанный к авторизованному арендатору. Один сервис никогда не увидит и не затронет данные другого — даже при ошибке в приложении."] },
    { id: "access", title: "Доступ и подотчётность", paragraphs: ["Сотрудники входят по хешированным учётным данным и короткоживущим подписанным токенам сессии. Эндпоинты аутентификации и интенсивной записи ограничены по частоте. **Журнал аудита**, в который записи только добавляются и где любое вмешательство оставляет след, фиксирует входы и привилегированные действия с их источником — у вас всегда есть ответ на вопрос «кто, что и когда сделал»."] },
    { id: "continuity", title: "Резервное копирование и восстановление", paragraphs: ["Рабочая база данных автоматически копируется каждую ночь, копии хранятся. Главное — эти копии по расписанию проходят **тест восстановления**: их разворачивают во временной среде и проверяют целостность, поэтому восстановление — проверенная процедура, а не надежда. Вся платформа описана как инфраструктура-как-код и может быть заново развёрнута на чистом сервере за минуты."] },
    { id: "data", title: "Владение данными и конфиденциальность", paragraphs: ["Ваши данные принадлежат вам. Вы можете в любой момент выгрузить клиентов, автомобили и финансовые записи, а при прекращении работы — попросить удалить рабочее пространство и его данные. Мы не продаём ваши данные и не используем их для обучения моделей машинного обучения. Полный текст — в [Политике конфиденциальности](/privacy)."] },
  ],
  callout: "Проводите аудит безопасности или нужен подписанный договор (DPA, особые условия)? Закажите демо — мы проведём вашу команду по архитектуре и документам.",
  ctaTitle: "Проверьте сами",
  ctaBody: "Изучите платформу в живом демо или назначьте звонок, чтобы разобрать архитектуру безопасности с вашей командой.",
};

const docsEn = {
  eyebrow: "Documentation",
  title: "Everything you need to run the shop",
  sub: "A quick tour of each part of GarageOS. New to it? Start with the live demo, then use this as your reference.",
  tocLabel: "Documentation contents",
  tocTitle: "On this page",
  sections: [
    { id: "getting-started", title: "Getting started", paragraphs: [
      "GarageOS is your shop’s operating system: scheduling, vehicles, customers, billing, and messaging in one place. Sign in with the account provided during onboarding and you land on the **Dashboard** — today’s appointments, fleet health, revenue, and anything that needs attention.",
      "The quickest way to learn the product is to open the [live demo](/demo) and click around a fully-loaded shop. Nothing there changes real data.",
    ] },
    { id: "appointments", title: "Appointments & calendar", paragraphs: [
      "The **Calendar** is a day board with a lane per mechanic. Drag an appointment to move it, drag its edge to resize, and the board flags conflicts as you go. Use the status actions to confirm, start, or complete work.",
      "The **Appointments** list is the operational queue — filter by status or date, search, and act on rows in bulk. Completing a job automatically writes a service record and updates the vehicle’s health.",
    ] },
    { id: "customers", title: "Customers", paragraphs: ["Open a customer to see everything about them in one place — vehicles, spend and payment history, conversations, and a merged timeline. Commercial Health scores how they pay, so advisors know who to prioritize."] },
    { id: "vehicles", title: "Vehicles", paragraphs: ["Each vehicle has a full record: identity, service history, and a computed **health score** from the maintenance engine. Health is derived from real mileage and service intervals — there is nothing to keep up to date by hand."] },
    { id: "passport", title: "Digital Passport", paragraphs: ["The **Vehicle Service Record** is a shareable, print-ready document with a scannable QR code. It summarizes service information recorded in GarageOS and identifies the garage that supplied those records; it is not an independent inspection or guarantee of vehicle condition. Open any vehicle and choose “View Service Record”."] },
    { id: "intelligence", title: "Vehicle Intelligence", paragraphs: ["The **Vehicle Intelligence Center** brings health, history, predictions, and commercial context into one view, with clickable subsystem hotspots. Predictions (next service, weakest system, breakdown risk) are deterministic — grounded in the data, not guesses."] },
    { id: "operations", title: "Operations & inbox", paragraphs: [
      "**Operations** is the dispatch console: emergencies, tows, and roadside calls become tracked cases with SLA timers and live status. Assign a technician and move the case through its lifecycle.",
      "The **Inbox** unifies every conversation — Telegram messages, walk-ins, internal notes — into one thread linked to the vehicle, case, or invoice it concerns.",
    ] },
    { id: "billing", title: "Billing", paragraphs: ["Create **estimates** customers can approve from their phone, convert them to **invoices**, and record **payments**. Every financial action lands on an append-only ledger that always reconciles, and flows into your reports."] },
    { id: "reports", title: "Reports", paragraphs: ["**Reports** project over that ledger and your operational data: revenue and receivables, collection rate, estimate-to-invoice conversion, and fleet and commercial health. Each figure is drillable back to its source."] },
    { id: "telegram", title: "Telegram customer app", paragraphs: ["Your customers get a zero-install app inside Telegram: they see their vehicle, approve estimates, message the shop, and call for roadside help. It runs on the same platform — a roadside request opens a real Operations case."] },
    { id: "faq", title: "FAQ", paragraphs: [
      "**How do customers get the Telegram app?** They open your garage’s bot and tap to launch — no app store, no install.",
      "**Can I run more than one location?** Yes, on the Multi-Location plan, with consolidated reporting and per-location branding.",
      "**Is there an API?** A public API is on the roadmap. Talk to us about your integration needs.",
    ] },
  ] as Section[],
  ctaTitle: "See the docs come to life",
  ctaBody: "Open the live demo and follow along in a fully-loaded shop, or book a walkthrough with our team.",
};

export type DocsCopy = typeof docsEn;

const docsUz: DocsCopy = {
  eyebrow: "Qoʻllanma",
  title: "Servisni yuritish uchun kerak boʻlgan hamma narsa",
  sub: "GarageOS’ning har bir boʻlimi boʻylab qisqa sayohat. Endi boshlayapsizmi? Avval jonli demoni oching, keyin bu sahifadan ma’lumotnoma sifatida foydalaning.",
  tocLabel: "Qoʻllanma mundarijasi",
  tocTitle: "Ushbu sahifada",
  sections: [
    { id: "getting-started", title: "Boshlash", paragraphs: [
      "GarageOS — servisingizning operatsion tizimi: ish jadvali, avtomobillar, mijozlar, hisob-kitob va xabarlar bir joyda. Ulanishda berilgan hisob bilan kiring — **Boshqaruv paneli** ochiladi: bugungi qabullar, avtopark holati, tushum va e’tibor talab qiladigan hamma narsa.",
      "Mahsulotni oʻrganishning eng tez yoʻli — [jonli demo](/demo)ni ochib, toʻliq toʻldirilgan servisda bemalol bosib koʻrish. U yerdagi hech bir harakat haqiqiy ma’lumotlarni oʻzgartirmaydi.",
    ] },
    { id: "appointments", title: "Qabullar va kalendar", paragraphs: [
      "**Kalendar** — har bir usta uchun alohida yoʻlakli kunlik jadval. Qabulni koʻchirish uchun uni sudrang, davomiyligini oʻzgartirish uchun chetidan torting — jadval ziddiyatlarni darhol belgilaydi. Ishni tasdiqlash, boshlash yoki yakunlash uchun holat tugmalaridan foydalaning.",
      "**Qabullar** roʻyxati — ishchi navbat: holat yoki sana boʻyicha filtrlang, qidiring va bir nechta qator bilan birdaniga ishlang. Ish yakunlanganda servis yozuvi avtomatik yaratiladi va avtomobil holati yangilanadi.",
    ] },
    { id: "customers", title: "Mijozlar", paragraphs: ["Mijozni oching va u haqidagi hamma narsani bir joyda koʻring — avtomobillari, xarajatlari va toʻlov tarixi, yozishmalar hamda umumiy xronologiya. Tijoriy holat bahosi mijoz qanday toʻlashini koʻrsatadi, shuning uchun masterlar kimga birinchi navbatda e’tibor berishni biladi."] },
    { id: "vehicles", title: "Avtomobillar", paragraphs: ["Har bir avtomobilning toʻliq kartasi bor: identifikatsiya, servis tarixi va texnik xizmat mexanizmi hisoblagan **holat bahosi**. Holat haqiqiy probeg va xizmat oraliqlaridan kelib chiqadi — qoʻlda yangilab borish kerak boʻlgan hech narsa yoʻq."] },
    { id: "passport", title: "Raqamli pasport", paragraphs: ["**Avtomobil servis yozuvi** — QR-kodli, ulashish va chop etishga tayyor hujjat. U GarageOS’da qayd etilgan servis ma’lumotlarini jamlaydi va bu yozuvlarni taqdim etgan servisni koʻrsatadi; u avtomobil holatining mustaqil ekspertizasi yoki kafolati emas. Istalgan avtomobilni oching va “Servis yozuvini koʻrish”ni tanlang."] },
    { id: "intelligence", title: "Avto tahlili", paragraphs: ["**Avto tahlil markazi** holat, tarix, prognozlar va tijoriy kontekstni bitta oynaga jamlaydi, tizimlar boʻyicha bosiladigan nuqtalar bilan. Prognozlar (keyingi servis, eng zaif tizim, buzilish xavfi) deterministik — taxminga emas, ma’lumotlarga asoslangan."] },
    { id: "operations", title: "Operatsiyalar va xabarlar", paragraphs: [
      "**Operatsiyalar** — dispetcherlik pulti: favqulodda holatlar, evakuator va yoʻlda yordam chaqiruvlari SLA taymerlari va jonli holatga ega kuzatiladigan murojaatlarga aylanadi. Texnikni tayinlang va murojaatni barcha bosqichlardan oʻtkazing.",
      "**Xabarlar** barcha yozishmalarni — Telegram xabarlari, oʻzi kelgan mijozlar, ichki izohlar — tegishli avtomobil, murojaat yoki hisobga bogʻlangan bitta oqimga birlashtiradi.",
    ] },
    { id: "billing", title: "Hisob-kitob", paragraphs: ["Mijozlar telefonidan tasdiqlay oladigan **smetalar** yarating, ularni **hisoblarga** aylantiring va **toʻlovlarni** qayd eting. Har bir moliyaviy amal faqat qoʻshib boriladigan, doim balanslanadigan reyestrga tushadi va hisobotlaringizga oʻtadi."] },
    { id: "reports", title: "Hisobotlar", paragraphs: ["**Hisobotlar** shu reyestr va ish ma’lumotlaringiz asosida tuziladi: tushum va debitorlik, undirish darajasi, smetadan hisobga oʻtish, avtopark va tijoriy holat. Har bir raqamni manbasigacha ochib koʻrish mumkin."] },
    { id: "telegram", title: "Telegram mijoz ilovasi", paragraphs: ["Mijozlaringiz Telegram ichida oʻrnatishsiz ishlaydigan ilovaga ega boʻladi: avtomobilini koʻradi, smetalarni tasdiqlaydi, servisga yozadi va yoʻlda yordam chaqiradi. Ilova shu platformada ishlaydi — yoʻlda yordam soʻrovi haqiqiy Operatsiyalar murojaatini ochadi."] },
    { id: "faq", title: "Savol-javoblar", paragraphs: [
      "**Mijozlar Telegram ilovasini qanday oladi?** Servisingiz botini ochib, bir bosishda ishga tushiradi — ilovalar doʻkoni ham, oʻrnatish ham kerak emas.",
      "**Bir nechta filialni yuritsam boʻladimi?** Ha, Tarmoq tarifida — umumiy hisobotlar va har bir filial uchun oʻz brendi bilan.",
      "**API bormi?** Ochiq API rejalarimizda bor. Integratsiya boʻyicha ehtiyojlaringizni biz bilan muhokama qiling.",
    ] },
  ],
  ctaTitle: "Qoʻllanmani amalda koʻring",
  ctaBody: "Jonli demoni oching va toʻliq toʻldirilgan servisda qadamma-qadam kuzating yoki jamoamiz bilan tanishtiruv belgilang.",
};

const docsRu: DocsCopy = {
  eyebrow: "Документация",
  title: "Всё, что нужно для работы сервиса",
  sub: "Короткий обзор каждого раздела GarageOS. Только начинаете? Откройте живое демо, а эту страницу используйте как справочник.",
  tocLabel: "Содержание документации",
  tocTitle: "На этой странице",
  sections: [
    { id: "getting-started", title: "Начало работы", paragraphs: [
      "GarageOS — операционная система вашего сервиса: расписание, автомобили, клиенты, расчёты и переписка в одном месте. Войдите с учётной записью, выданной при подключении, — откроется **Панель**: записи на сегодня, состояние автопарка, выручка и всё, что требует внимания.",
      "Быстрее всего освоить продукт — открыть [живое демо](/demo) и пройтись по полностью заполненному сервису. Там ничто не меняет реальные данные.",
    ] },
    { id: "appointments", title: "Записи и календарь", paragraphs: [
      "**Календарь** — дневная доска с дорожкой для каждого механика. Перетащите запись, чтобы перенести её, потяните за край, чтобы изменить длительность, — доска сразу отмечает конфликты. Кнопками статуса подтверждайте, начинайте и завершайте работы.",
      "Список **Записи** — рабочая очередь: фильтруйте по статусу или дате, ищите и обрабатывайте строки пакетно. Завершение работы автоматически создаёт сервисную запись и обновляет состояние автомобиля.",
    ] },
    { id: "customers", title: "Клиенты", paragraphs: ["Откройте клиента и увидите всё о нём в одном месте — автомобили, расходы и историю оплат, переписку и общую хронологию. Коммерческий рейтинг показывает, как клиент платит, чтобы приёмщики знали, кому уделить внимание в первую очередь."] },
    { id: "vehicles", title: "Автомобили", paragraphs: ["У каждого автомобиля полная карточка: идентификация, сервисная история и **оценка состояния**, рассчитанная движком техобслуживания. Состояние выводится из реального пробега и интервалов обслуживания — вручную ничего обновлять не нужно."] },
    { id: "passport", title: "Цифровой паспорт", paragraphs: ["**Сервисная запись автомобиля** — документ с QR-кодом, готовый к отправке и печати. Он сводит сервисные данные, внесённые в GarageOS, и указывает сервис, предоставивший эти записи; это не независимая экспертиза и не гарантия состояния автомобиля. Откройте любой автомобиль и выберите «Сервисная запись»."] },
    { id: "intelligence", title: "Аналитика автомобиля", paragraphs: ["**Центр аналитики автомобиля** объединяет состояние, историю, прогнозы и коммерческий контекст в одном окне с кликабельными точками по системам. Прогнозы (следующее ТО, самая слабая система, риск поломки) детерминированы — основаны на данных, а не на догадках."] },
    { id: "operations", title: "Операции и входящие", paragraphs: [
      "**Операции** — диспетчерский пульт: экстренные случаи, эвакуация и вызовы помощи на дороге превращаются в отслеживаемые обращения с SLA-таймерами и статусом в реальном времени. Назначьте техника и проведите обращение по всем этапам.",
      "**Входящие** объединяют всю переписку — сообщения в Telegram, клиентов, пришедших лично, внутренние заметки — в одну ленту, привязанную к автомобилю, обращению или счёту.",
    ] },
    { id: "billing", title: "Расчёты", paragraphs: ["Создавайте **сметы**, которые клиенты согласуют с телефона, превращайте их в **счета** и фиксируйте **оплаты**. Каждая финансовая операция попадает в журнал, куда записи только добавляются и который всегда сходится, и переходит в отчёты."] },
    { id: "reports", title: "Отчёты", paragraphs: ["**Отчёты** строятся на этом журнале и ваших рабочих данных: выручка и дебиторская задолженность, уровень сбора оплат, конверсия смет в счета, состояние автопарка и коммерческие показатели. Любую цифру можно раскрыть до источника."] },
    { id: "telegram", title: "Telegram-приложение для клиентов", paragraphs: ["Ваши клиенты получают приложение внутри Telegram без установки: видят свой автомобиль, согласуют сметы, пишут в сервис и вызывают помощь на дороге. Оно работает на той же платформе — запрос помощи открывает настоящее обращение в Операциях."] },
    { id: "faq", title: "Частые вопросы", paragraphs: [
      "**Как клиенты получают Telegram-приложение?** Открывают бота вашего сервиса и запускают его в одно касание — без магазина приложений и установки.",
      "**Можно вести несколько филиалов?** Да, на тарифе «Сеть СТО» — со сводной отчётностью и брендингом каждого филиала.",
      "**Есть ли API?** Публичный API в планах. Расскажите нам о ваших задачах интеграции.",
    ] },
  ],
  ctaTitle: "Документация в действии",
  ctaBody: "Откройте живое демо и повторяйте шаги в полностью заполненном сервисе или запишитесь на презентацию с нашей командой.",
};

export const securityMessages = { uz: securityUz, ru: securityRu, en: securityEn };
export const docsMessages = { uz: docsUz, ru: docsRu, en: docsEn };
