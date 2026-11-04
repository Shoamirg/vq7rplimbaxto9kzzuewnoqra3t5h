// /privacy and /terms copy (uz default, ru, en). English is the source text;
// translations are faithful renderings — do not add obligations here that the
// English text does not contain. Inline markup: `**bold**` and `[label](/path|mailto:)`.
export type LegalBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDocument = { title: string; updated: string; callout: string; intro: string; sections: LegalSection[] };

const p = (text: string): LegalBlock => ({ kind: "p", text });
const ul = (...items: string[]): LegalBlock => ({ kind: "ul", items });

const en: { privacy: LegalDocument; terms: LegalDocument } = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: 3 July 2026",
    callout: "This is a starting-point policy template. Before you launch, have it reviewed by qualified legal counsel to match your jurisdiction, entity, and data-processing practices.",
    intro: "GarageOS (“GarageOS”, “we”, “us”) provides garage-management software to businesses (each a “Customer”). This policy explains how we handle personal data when you visit our website and when a Customer uses the platform.",
    sections: [
      { id: "collect", title: "Information we collect", blocks: [
        ul("**Account data** — name, work email, and role of the staff who use GarageOS.",
          "**Customer-provided data** — records a garage enters about its own customers and vehicles (contact details, vehicle history, appointments, invoices).",
          "**Usage data** — logs, device and browser information, and diagnostic events used to operate and secure the service."),
        p("For data a garage enters about its own customers, the garage is the data controller and GarageOS acts as a processor on its behalf."),
      ] },
      { id: "use", title: "How we use data", blocks: [
        ul("To provide, maintain, and secure the platform.", "To authenticate users and prevent abuse.", "To provide support and communicate about the service.", "To improve reliability and performance."),
        p("We do not sell personal data, and we do not use Customer data to train machine-learning models."),
      ] },
      { id: "sharing", title: "Sharing", blocks: [p("We share data only with infrastructure sub-processors needed to run the service (for example, hosting, database, and error-monitoring providers), each under appropriate contractual safeguards; when required by law; or with your instruction.")] },
      { id: "retention", title: "Retention", blocks: [p("We retain personal data for as long as an account is active and as needed to provide the service, then delete or anonymize it within a reasonable period after termination, unless a longer period is required by law.")] },
      { id: "security", title: "Security", blocks: [p("We use tenant isolation, encryption in transit, hardened authentication, audit logging, and tested backups. See our [Security page](/security) for details. No system is perfectly secure, but we work continuously to protect your data.")] },
      { id: "rights", title: "Your rights", blocks: [p("Depending on your location, you may have rights to access, correct, export, or delete your personal data. Customers can export their data at any time. To exercise a right, contact us using the details below; for data a garage holds about you as its customer, please contact that garage.")] },
      { id: "transfers", title: "International transfers & children", blocks: [p("Where data is processed across borders, we rely on appropriate legal transfer mechanisms. The service is not directed to children and is intended for business use.")] },
      { id: "changes", title: "Changes & contact", blocks: [p("We may update this policy from time to time and will revise the date above. Questions or requests: [privacy@garageos.app](mailto:privacy@garageos.app).")] },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "Last updated: 3 July 2026",
    callout: "This is a starting-point template. Before you launch, have it reviewed by qualified legal counsel to match your jurisdiction, entity, and commercial terms.",
    intro: "These Terms of Service (“Terms”) govern access to and use of the GarageOS platform (the “Service”). By using the Service, you agree to these Terms on behalf of your business (“Customer”).",
    sections: [
      { id: "accounts", title: "Accounts", blocks: [p("You are responsible for your account, for the security of your credentials, and for the actions of users you invite. You must provide accurate information and promptly update it.")] },
      { id: "acceptable-use", title: "Acceptable use", blocks: [
        p("You agree not to misuse the Service, including by attempting to:"),
        ul("access data belonging to another Customer;", "disrupt, probe, or overload the Service;", "reverse engineer or resell the Service without authorization;", "use the Service to store unlawful content or to violate the rights of others."),
      ] },
      { id: "data", title: "Customer data & ownership", blocks: [p("As between the parties, Customer owns all data it submits to the Service. Customer grants us a limited license to host and process that data solely to provide the Service. We process personal data as described in the [Privacy Policy](/privacy). Customer can export its data at any time.")] },
      { id: "billing", title: "Fees & billing", blocks: [p("Paid plans are billed per location on a recurring basis. Fees are due in advance and are non-refundable except where required by law. We may change pricing with reasonable notice effective at the next billing cycle.")] },
      { id: "trials", title: "Trials & demo", blocks: [p("Any public demo is provided for evaluation only, on a read-only basis, and may be changed or withdrawn at any time. Trials, if offered, convert to a paid plan unless cancelled before the trial ends.")] },
      { id: "ip", title: "Intellectual property", blocks: [p("The Service, including its software, design, and brand, is owned by GarageOS and protected by law. These Terms grant no rights to our intellectual property except the limited right to use the Service.")] },
      { id: "warranty", title: "Warranties & liability", blocks: [p("The Service is provided “as is” without warranties of any kind to the maximum extent permitted by law. To the extent permitted by law, our aggregate liability arising out of or related to the Service is limited to the fees paid by Customer in the twelve months preceding the claim, and we are not liable for indirect or consequential damages.")] },
      { id: "termination", title: "Termination", blocks: [p("Either party may terminate for material breach that remains uncured after notice. On termination, access ends and we will make Customer data available for export for a limited period before deletion.")] },
      { id: "changes", title: "Changes, governing law & contact", blocks: [p("We may update these Terms and will revise the date above; continued use constitutes acceptance. These Terms are governed by the laws of the jurisdiction stated in your order or, absent one, the jurisdiction of GarageOS. Questions: [legal@garageos.app](mailto:legal@garageos.app).")] },
    ],
  },
};

export type LegalCopy = typeof en;

const uz: LegalCopy = {
  privacy: {
    title: "Maxfiylik siyosati",
    updated: "Oxirgi yangilanish: 2026-yil 3-iyul",
    callout: "Bu maxfiylik siyosatining boshlangʻich shabloni. Ishga tushirishdan oldin uni yurisdiksiyangiz, yuridik shaxsingiz va ma’lumotlarni qayta ishlash amaliyotingizga moslash uchun malakali yuristga koʻrsating.",
    intro: "GarageOS (“GarageOS”, “biz”) bizneslarga (har biri — “Mijoz”) avtoservisni boshqarish dasturini taqdim etadi. Ushbu siyosat veb-saytimizga tashrif buyurganingizda va Mijoz platformadan foydalanganda shaxsiy ma’lumotlar bilan qanday ishlashimizni tushuntiradi.",
    sections: [
      { id: "collect", title: "Biz yigʻadigan ma’lumotlar", blocks: [
        ul("**Hisob ma’lumotlari** — GarageOS’dan foydalanadigan xodimlarning ismi, ish email manzili va lavozimi.",
          "**Mijoz kiritgan ma’lumotlar** — servis oʻz mijozlari va avtomobillari haqida kiritadigan yozuvlar (aloqa ma’lumotlari, avtomobil tarixi, qabullar, hisoblar).",
          "**Foydalanish ma’lumotlari** — xizmatni ishlatish va himoyalash uchun qoʻllanadigan loglar, qurilma va brauzer haqidagi ma’lumotlar hamda diagnostika hodisalari."),
        p("Servis oʻz mijozlari haqida kiritgan ma’lumotlarga nisbatan servis ma’lumotlar nazoratchisi (controller) hisoblanadi, GarageOS esa uning nomidan qayta ishlovchi (processor) sifatida ishlaydi."),
      ] },
      { id: "use", title: "Ma’lumotlardan qanday foydalanamiz", blocks: [
        ul("Platformani taqdim etish, qoʻllab-quvvatlash va himoyalash uchun.", "Foydalanuvchilarni autentifikatsiya qilish va suiiste’molning oldini olish uchun.", "Yordam koʻrsatish va xizmat yuzasidan aloqa qilish uchun.", "Ishonchlilik va unumdorlikni yaxshilash uchun."),
        p("Biz shaxsiy ma’lumotlarni sotmaymiz va Mijoz ma’lumotlaridan mashinali oʻqitish modellarini oʻqitishda foydalanmaymiz."),
      ] },
      { id: "sharing", title: "Ma’lumotlarni uzatish", blocks: [p("Biz ma’lumotlarni faqat xizmat ishlashi uchun zarur boʻlgan infratuzilma sub-protsessorlariga (masalan, hosting, ma’lumotlar bazasi va xatolarni kuzatish provayderlariga) — har biriga tegishli shartnomaviy kafolatlar asosida —, qonun talab qilganda yoki sizning koʻrsatmangiz bilan uzatamiz.")] },
      { id: "retention", title: "Saqlash muddati", blocks: [p("Shaxsiy ma’lumotlarni hisob faol boʻlgan va xizmat koʻrsatish uchun zarur boʻlgan muddat davomida saqlaymiz, soʻngra, agar qonun uzoqroq muddatni talab qilmasa, shartnoma tugaganidan keyin oqilona muddat ichida ularni oʻchiramiz yoki anonimlashtiramiz.")] },
      { id: "security", title: "Xavfsizlik", blocks: [p("Biz servislarni bir-biridan ajratish, uzatishda shifrlash, mustahkam autentifikatsiya, audit jurnali va sinovdan oʻtgan zaxira nusxalardan foydalanamiz. Batafsil — [Xavfsizlik sahifasi](/security)da. Hech bir tizim mutlaqo xavfsiz emas, ammo biz ma’lumotlaringizni himoya qilish ustida doimiy ishlaymiz.")] },
      { id: "rights", title: "Sizning huquqlaringiz", blocks: [p("Joylashuvingizga qarab, shaxsiy ma’lumotlaringiz bilan tanishish, ularni tuzatish, eksport qilish yoki oʻchirish huquqlariga ega boʻlishingiz mumkin. Mijozlar oʻz ma’lumotlarini istalgan vaqtda eksport qila oladi. Huquqdan foydalanish uchun quyidagi manzil orqali biz bilan bogʻlaning; servis siz haqingizda — uning mijozi sifatida — saqlaydigan ma’lumotlar yuzasidan esa oʻsha servisga murojaat qiling.")] },
      { id: "transfers", title: "Xalqaro uzatish va bolalar", blocks: [p("Ma’lumotlar chegaralararo qayta ishlanganda biz tegishli huquqiy uzatish mexanizmlariga tayanamiz. Xizmat bolalarga qaratilmagan va biznes maqsadlarida foydalanish uchun moʻljallangan.")] },
      { id: "changes", title: "Oʻzgarishlar va aloqa", blocks: [p("Biz ushbu siyosatni vaqti-vaqti bilan yangilashimiz mumkin va yuqoridagi sanani oʻzgartiramiz. Savollar va soʻrovlar: [privacy@garageos.app](mailto:privacy@garageos.app).")] },
    ],
  },
  terms: {
    title: "Foydalanish shartlari",
    updated: "Oxirgi yangilanish: 2026-yil 3-iyul",
    callout: "Bu boshlangʻich shablon. Ishga tushirishdan oldin uni yurisdiksiyangiz, yuridik shaxsingiz va tijorat shartlaringizga moslash uchun malakali yuristga koʻrsating.",
    intro: "Ushbu Foydalanish shartlari (“Shartlar”) GarageOS platformasiga (“Xizmat”) kirish va undan foydalanishni tartibga soladi. Xizmatdan foydalanib, siz biznesingiz (“Mijoz”) nomidan ushbu Shartlarga rozilik bildirasiz.",
    sections: [
      { id: "accounts", title: "Hisoblar", blocks: [p("Hisobingiz, login ma’lumotlaringiz xavfsizligi va siz taklif qilgan foydalanuvchilarning harakatlari uchun siz javobgarsiz. Siz aniq ma’lumot taqdim etishingiz va uni zudlik bilan yangilab borishingiz shart.")] },
      { id: "acceptable-use", title: "Ruxsat etilgan foydalanish", blocks: [
        p("Siz Xizmatdan notoʻgʻri foydalanmaslikka, jumladan quyidagilarga urinmaslikka rozilik bildirasiz:"),
        ul("boshqa Mijozga tegishli ma’lumotlarga kirish;", "Xizmat ishini buzish, uni zondlash yoki haddan tashqari yuklash;", "ruxsatsiz Xizmatni teskari muhandislik qilish yoki qayta sotish;", "Xizmatdan noqonuniy kontentni saqlash yoki boshqalarning huquqlarini buzish uchun foydalanish."),
      ] },
      { id: "data", title: "Mijoz ma’lumotlari va egalik", blocks: [p("Tomonlar oʻrtasidagi munosabatda Mijoz Xizmatga taqdim etgan barcha ma’lumotlarning egasi hisoblanadi. Mijoz bizga ushbu ma’lumotlarni faqat Xizmatni koʻrsatish maqsadida joylashtirish va qayta ishlash uchun cheklangan litsenziya beradi. Shaxsiy ma’lumotlarni [Maxfiylik siyosati](/privacy)da tavsiflanganidek qayta ishlaymiz. Mijoz oʻz ma’lumotlarini istalgan vaqtda eksport qila oladi.")] },
      { id: "billing", title: "Toʻlovlar va hisob-kitob", blocks: [p("Pullik tariflar uchun toʻlov har bir filial uchun muntazam ravishda undiriladi. Toʻlovlar oldindan amalga oshiriladi va qonunda talab qilingan hollardan tashqari qaytarilmaydi. Biz narxlarni oqilona muddat oldin xabardor qilib oʻzgartirishimiz mumkin; oʻzgarish keyingi hisob davridan kuchga kiradi.")] },
      { id: "trials", title: "Sinov muddati va demo", blocks: [p("Har qanday ochiq demo faqat tanishish uchun, faqat koʻrish rejimida taqdim etiladi va istalgan vaqtda oʻzgartirilishi yoki toʻxtatilishi mumkin. Sinov muddati taqdim etilsa, u tugashidan oldin bekor qilinmagan taqdirda pullik tarifga oʻtadi.")] },
      { id: "ip", title: "Intellektual mulk", blocks: [p("Xizmat, jumladan uning dasturiy ta’minoti, dizayni va brendi GarageOS’ga tegishli va qonun bilan himoyalangan. Ushbu Shartlar Xizmatdan foydalanishning cheklangan huquqidan tashqari intellektual mulkimizga hech qanday huquq bermaydi.")] },
      { id: "warranty", title: "Kafolatlar va javobgarlik", blocks: [p("Qonun ruxsat bergan maksimal darajada Xizmat hech qanday kafolatlarsiz, “boricha” taqdim etiladi. Qonun ruxsat bergan darajada Xizmatdan kelib chiqadigan yoki u bilan bogʻliq umumiy javobgarligimiz da’vodan oldingi oʻn ikki oy ichida Mijoz toʻlagan summa bilan cheklanadi va biz bilvosita yoki oqibatdagi zararlar uchun javobgar emasmiz.")] },
      { id: "termination", title: "Shartnomani bekor qilish", blocks: [p("Har qaysi tomon ogohlantirishdan keyin ham bartaraf etilmagan jiddiy qoidabuzarlik sababli shartnomani bekor qilishi mumkin. Bekor qilinganda kirish toʻxtatiladi va biz Mijoz ma’lumotlarini oʻchirishdan oldin ularni cheklangan muddat davomida eksport qilish uchun taqdim etamiz.")] },
      { id: "changes", title: "Oʻzgarishlar, amaldagi qonun va aloqa", blocks: [p("Biz ushbu Shartlarni yangilashimiz va yuqoridagi sanani oʻzgartirishimiz mumkin; Xizmatdan foydalanishni davom ettirish ularni qabul qilishni anglatadi. Ushbu Shartlar buyurtmangizda koʻrsatilgan yurisdiksiya qonunlari bilan, u boʻlmasa — GarageOS yurisdiksiyasi qonunlari bilan tartibga solinadi. Savollar: [legal@garageos.app](mailto:legal@garageos.app).")] },
    ],
  },
};

const ru: LegalCopy = {
  privacy: {
    title: "Политика конфиденциальности",
    updated: "Последнее обновление: 3 июля 2026 г.",
    callout: "Это базовый шаблон политики. Перед запуском попросите квалифицированного юриста проверить его на соответствие вашей юрисдикции, юрлицу и практике обработки данных.",
    intro: "GarageOS («GarageOS», «мы», «нас») предоставляет бизнесу программное обеспечение для управления автосервисом (каждый такой бизнес — «Клиент»). Эта политика объясняет, как мы обращаемся с персональными данными, когда вы посещаете наш сайт и когда Клиент пользуется платформой.",
    sections: [
      { id: "collect", title: "Какие данные мы собираем", blocks: [
        ul("**Данные учётных записей** — имя, рабочий email и роль сотрудников, которые пользуются GarageOS.",
          "**Данные, внесённые Клиентом** — записи, которые сервис ведёт о своих клиентах и автомобилях (контакты, история автомобиля, записи на обслуживание, счета).",
          "**Данные об использовании** — логи, сведения об устройстве и браузере и диагностические события, необходимые для работы и защиты сервиса."),
        p("В отношении данных, которые сервис вносит о своих клиентах, сервис является контролёром данных, а GarageOS действует как обработчик от его имени."),
      ] },
      { id: "use", title: "Как мы используем данные", blocks: [
        ul("Чтобы предоставлять, поддерживать и защищать платформу.", "Чтобы аутентифицировать пользователей и предотвращать злоупотребления.", "Чтобы оказывать поддержку и сообщать о работе сервиса.", "Чтобы повышать надёжность и производительность."),
        p("Мы не продаём персональные данные и не используем данные Клиентов для обучения моделей машинного обучения."),
      ] },
      { id: "sharing", title: "Передача данных", blocks: [p("Мы передаём данные только субпроцессорам инфраструктуры, необходимым для работы сервиса (например, поставщикам хостинга, баз данных и мониторинга ошибок), — каждому на основании надлежащих договорных гарантий; когда этого требует закон; или по вашему указанию.")] },
      { id: "retention", title: "Хранение", blocks: [p("Мы храним персональные данные, пока учётная запись активна и пока это необходимо для оказания услуг, а затем удаляем или обезличиваем их в разумный срок после прекращения работы, если закон не требует более длительного хранения.")] },
      { id: "security", title: "Безопасность", blocks: [p("Мы применяем изоляцию сервисов, шифрование при передаче, надёжную аутентификацию, журнал аудита и проверенные резервные копии. Подробнее — на [странице безопасности](/security). Ни одна система не защищена идеально, но мы постоянно работаем над защитой ваших данных.")] },
      { id: "rights", title: "Ваши права", blocks: [p("В зависимости от вашего местонахождения у вас может быть право на доступ к своим персональным данным, их исправление, выгрузку или удаление. Клиенты могут выгрузить свои данные в любой момент. Чтобы воспользоваться правом, свяжитесь с нами по контактам ниже; по данным, которые сервис хранит о вас как о своём клиенте, обращайтесь в этот сервис.")] },
      { id: "transfers", title: "Трансграничная передача и дети", blocks: [p("Если данные обрабатываются за пределами одной страны, мы опираемся на надлежащие правовые механизмы передачи. Сервис не предназначен для детей и рассчитан на использование бизнесом.")] },
      { id: "changes", title: "Изменения и контакты", blocks: [p("Мы можем время от времени обновлять эту политику и будем менять дату выше. Вопросы и запросы: [privacy@garageos.app](mailto:privacy@garageos.app).")] },
    ],
  },
  terms: {
    title: "Условия использования",
    updated: "Последнее обновление: 3 июля 2026 г.",
    callout: "Это базовый шаблон. Перед запуском попросите квалифицированного юриста проверить его на соответствие вашей юрисдикции, юрлицу и коммерческим условиям.",
    intro: "Настоящие Условия использования («Условия») регулируют доступ к платформе GarageOS («Сервис») и её использование. Используя Сервис, вы принимаете эти Условия от имени своего бизнеса («Клиент»).",
    sections: [
      { id: "accounts", title: "Учётные записи", blocks: [p("Вы отвечаете за свою учётную запись, за безопасность своих учётных данных и за действия приглашённых вами пользователей. Вы обязаны предоставлять точные сведения и своевременно их обновлять.")] },
      { id: "acceptable-use", title: "Допустимое использование", blocks: [
        p("Вы обязуетесь не злоупотреблять Сервисом, в том числе не пытаться:"),
        ul("получить доступ к данным другого Клиента;", "нарушать работу Сервиса, зондировать его или создавать на него чрезмерную нагрузку;", "без разрешения проводить обратную разработку Сервиса или перепродавать его;", "использовать Сервис для хранения незаконного контента или нарушения прав других лиц."),
      ] },
      { id: "data", title: "Данные Клиента и право собственности", blocks: [p("В отношениях между сторонами Клиенту принадлежат все данные, которые он передаёт в Сервис. Клиент предоставляет нам ограниченную лицензию на размещение и обработку этих данных исключительно для оказания услуг Сервиса. Персональные данные мы обрабатываем согласно [Политике конфиденциальности](/privacy). Клиент может выгрузить свои данные в любой момент.")] },
      { id: "billing", title: "Оплата и расчёты", blocks: [p("Платные тарифы оплачиваются за каждый филиал на регулярной основе. Оплата вносится авансом и не возвращается, кроме случаев, когда этого требует закон. Мы можем изменить цены с разумным предварительным уведомлением; изменения вступают в силу со следующего расчётного периода.")] },
      { id: "trials", title: "Пробный период и демо", blocks: [p("Любое публичное демо предоставляется только для ознакомления, в режиме только для чтения, и может быть изменено или отключено в любой момент. Пробный период, если он предоставляется, переходит в платный тариф, если его не отменить до окончания пробного периода.")] },
      { id: "ip", title: "Интеллектуальная собственность", blocks: [p("Сервис, включая его программное обеспечение, дизайн и бренд, принадлежит GarageOS и охраняется законом. Настоящие Условия не предоставляют никаких прав на нашу интеллектуальную собственность, кроме ограниченного права пользоваться Сервисом.")] },
      { id: "warranty", title: "Гарантии и ответственность", blocks: [p("В максимальной степени, допускаемой законом, Сервис предоставляется «как есть», без каких-либо гарантий. В той мере, в какой это допускает закон, наша совокупная ответственность, возникающая из Сервиса или в связи с ним, ограничена суммой, уплаченной Клиентом за двенадцать месяцев до предъявления требования, и мы не несём ответственности за косвенные или последующие убытки.")] },
      { id: "termination", title: "Прекращение", blocks: [p("Каждая сторона может расторгнуть договор при существенном нарушении, не устранённом после уведомления. При прекращении доступ закрывается, а данные Клиента остаются доступными для выгрузки в течение ограниченного срока до удаления.")] },
      { id: "changes", title: "Изменения, применимое право и контакты", blocks: [p("Мы можем обновлять эти Условия и будем менять дату выше; продолжение использования означает их принятие. Настоящие Условия регулируются правом юрисдикции, указанной в вашем заказе, а при её отсутствии — правом юрисдикции GarageOS. Вопросы: [legal@garageos.app](mailto:legal@garageos.app).")] },
    ],
  },
};

export const legalMessages = { uz, ru, en };
