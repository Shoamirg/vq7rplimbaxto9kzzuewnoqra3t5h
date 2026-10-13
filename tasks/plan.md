# Implementation Plan: GarageOS ish buyurtmalari

## Maqsad

Tasdiqlangan `docs/specs/SPEC-work-orders.md` bo‘yicha bitta servis uchun uchrashuvdan yoki navbatsiz ochiladigan ish buyurtmalarini qurish. Backend mavjud mijoz, mashina, uchrashuv, xodim, xizmat tarixi va audit modellariga ulanadi; admin panelda qabul, navbat va topshirish oqimi ishlaydi. Deploy bu ish doirasiga kirmaydi.

## Arxitektura qarorlari

- FastAPI endpointlari `get_tenant_uow` va tenant-scoped repository naqshidan foydalanadi. Ruxsat server tomonda tekshiriladi; tenant ID faqat autentifikatsiyalangan xodimdan olinadi.
- `WorkOrder` alohida ORM modeli bo‘ladi. Bazada appointment uchun partial unique constraint, idempotency uchun `(service_center_id, idempotency_key)` unique constraint, `ServiceRecord.work_order_id` uchun unique constraint qo‘llanadi.
- Yaratish idempotency-si Redis’ga emas, shu tranzaksiyada saqlanadigan kalit va canonical request fingerprint’ga tayanadi.
- `ready` transition buyurtma, xizmat tarixi, odometr, bog‘langan uchrashuv va audit yozuvini bitta UnitOfWork tranzaksiyasida boshqaradi. DB unique constraint parallel takrorni yakuniy himoya qiladi.
- Buyurtmaga bog‘lanmagan uchrashuvlarni yakunlashning eski yo‘li saqlanadi. Bog‘langan uchrashuv uchun eski endpoint yangi `ready` oqimiga yo‘naltiriladi.
- Admin panel mavjud Next.js app-router, `clientFetch`, dizayn tizimi va uch tildagi staff dictionary’ni davom ettiradi. E2E sintetik demo ma’lumotlari bilan lokal PostgreSQL/backend’dan foydalanadi; production deploy qilinmaydi. Next 16 dev E2E uchun Playwright `localhost:3000` manzilidan foydalanadi, chunki Next dev server `127.0.0.1` originidan HMR’ni bloklaydi.

## Amalga oshirish ketma-ketligi

### 1-bosqich: Jadval va invariantlar

`WorkOrder` modeli, migration va `ServiceRecord.work_order_id` aloqasini qo‘shish. Bazadagi unikal cheklovlar va indekslarni metadata/migration tekshiruvlari bilan tasdiqlash.

### 2-bosqich: Qabul qilish va navbatsiz yaratish

API request/response, tenant repository, mijoz-mashina-uchrashuv-mexanik ownership tekshiruvi, idempotency va audit bilan yaratishni test-first va kichik bo‘laklarda qurish. Uchrashuvga ikkinchi buyurtma ochilmasin; bir xil kalit va mazmun mavjud yozuvni qaytarsin.

### Checkpoint A

- [x] Model/migration va create oqimi testdan o‘tadi.
- [x] Bir servis doirasidagi aloqalar va qayta yuborish qoidalari isbotlangan.
- [x] Migration offline SQL hosil qiladi.

### 3-bosqich: Ro‘yxat va tafsilot

Sahifalangan, status filter’li tenant-safe GET endpointlar. Mexanik faqat o‘ziga biriktirilgan buyurtmani ko‘radi va serializatsiyada mijoz telefoni/manzili chiqmaydi.

### 4-bosqich: Holat va xizmat tarixi

Ruxsatli holat o‘tishlari, completion odometri, bajarilgan ish va narxni yangilash; `ready` paytida xizmat tarixini bir marta yozish. Uchrashuvni yakunlash endpointini bog‘langan/yangi eski oqimlarga xavfsiz ajratish. Parallel/takroriy finalize va rollback holatlarini tekshirish.

### Checkpoint B

- [x] Walk-in va appointment-linked buyurtma API orqali end-to-end tasdiqlangan.
- [x] Takroriy ServiceRecord yaratib bo‘lmaydi; odometer pasaymaydi.
- [x] Legacy appointment complete yo‘li testdan o‘tadi.
- [x] Role va cross-tenant testlari o‘tadi.

### 5-bosqich: Admin panel ish navbati

`/work-orders` sahifasi, status navbati, tafsilot kartasi va navbatsiz qabul formasi. Mijoz/mashina qidiruvi, topilmagan mijozni yaratish va faol marka/model katalogidan avtomobil qo‘shishni ulash; yuklanish/xato/bo‘sh holatlari va mobil layoutni tekshirish.

### 6-bosqich: Uchrashuv bilan bog‘lash va brauzer tekshiruvi

Uchrashuv ekranidan buyurtma yaratish va buyurtma holatini ko‘rish. Reception va mechanic rollariga mos boshqaruvlarni ko‘rsatish. Playwright’da walk-in hamda appointment oqimini tekshirish.

**Holat:** Work-order MVP implementatsiyasi `d6dff3a` commitda yakunlandi. Lokal demo yo‘riqnomasi `garageos/docs/setup/local-demo.md` faylida, sinov ro‘yxati `docs/testing/work-order-pilot-checklist.md` faylida. Oxirgi GitHub Actions tekshiruvi (run 38298489077, commit 5d0d88d) backend testlari, dependency audit, frontend typecheck/i18n/lint/build va Browser Playwrightni muvaffaqiyatli bajardi. Bu tekshiruvlar avtomatlashtirilgan; servis xodimi bilan mahalliy pilotning o‘rnini bosmaydi. Joriy ish muhitida Docker Engine ishlamayapti (`dockerDesktopLinuxEngine` pipe mavjud emas), shuning uchun Task 7/Checkpoint D hali bajarilmagan. Pulli hosting va production deploy qilinmagan.

### Checkpoint C

- [x] Backend testlar va frontend lint/build o‘tadi.
- [x] Desktop/mobile brauzer oqimlari muvaffaqiyatli.
- [x] Diff xavfsizlik, accessibility, tenant chegarasi va scope bo‘yicha yakuniy ko‘rib chiqilgan.
- [x] Backend dependency audit’da zaifliklar topilib bartaraf qilindi; `pip-audit` CI gate’iga qo‘shildi.
- [ ] Full dev-dependency audit high xavflari upstream patch chiqqach bartaraf qilinsin; production chiqarishdan oldin audit qayta bajarilsin.

## Xatarlar va kamaytirish

| Xatar | Ta’sir | Kamaytirish |
|---|---|---|
| Testlar seeded demo tenantga va migration’da yo‘q yordamchi jadvallarga bog‘liq | Toza test bazasida login yoki jadval xatolari chiqadi | Izolyatsiyalangan PostgreSQL’da avval migration, keyin `python -m app.seeds.demo` bajarib testlarni ishga tushirish |
| Appointment complete eski flow xizmat tarixini bir marta yozadi, lekin retry/concurrency guard yo‘q | Dublikat yoki takroriy yakunlash | Faqat work order bog‘langan holatni yangi tranzaksiyaga yo‘naltirish; legacy holatni regressiya testi bilan saqlash |
| API endpointlarda mavjud role dependency yo‘q | Ruxsatsiz amal | Work order endpointlarda aniq role policy va assigned-mechanic tekshiruvi; UI yashirishni yagona himoya qilmaslik |
| DB parallel create/finalize poygasi | Ikki ish buyurtmasi yoki history | Partial/ordinary unique constraint va tranzaksiya ichidagi state check; IntegrityError’ni domain 409 ga aylantirish |
| Demo read-only middleware mutatsiyani bloklaydi | E2E create flow ishlamaydi | E2E setup’ni mutatsiya qilish mumkin bo‘lgan test akkauntiga moslash; demo token uchun read-only xatti-harakatni alohida tekshirish |
| Tailwind CSS 4 eski brauzerlarni qo‘llamaydi | Eski Safari/Chrome/Firefox’da ko‘rinish buzilishi mumkin | Pilot qurilmalar brauzerlarini tekshirish; kerak bo‘lsa qo‘llab-quvvatlash matritsasini kelishib, CSS/browser testini qo‘shish |

## Ochiq masala

- Pilotda `in_progress` holatidan keyin bekor qilish/qisman bajarilgan xizmatni qayd etish kerakmi — MVP’da hozircha yo‘q.

Security gate: `npm audit --omit=dev` 0; to‘liq auditda esa bitta advisory bo‘yicha 5 high yozuv bor. Yo‘l: `eslint-config-next@16.4.0` → `@next/eslint-plugin-next@16.4.0` → `fast-glob` → `micromatch` → `braces@3.0.3`. Hammasi development/lint tooling zanjirida, production dependency auditida chiqmaydi. GitHub advisory `braces <=3.0.3`ni ta’sirlangan deb belgilaydi va patched version ko‘rsatmaydi ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)); npm registry’dagi eng so‘nggi `braces` ham `3.0.3`. npm audit tavsiya qilgan `eslint-config-next@14.2.35` esa major downgrade bo‘lib, Next.js 16.4 bilan mos o‘rnini bosmaydi. Shu sabab majburiy downgrade yoki transitive override qo‘llanmaydi. Bu holatni “audit toza” deb hisoblamaymiz: lint/CI zanjirida qolgan vaqtinchalik risk sifatida qayd etildi; `braces` patch’i yoki xavfsiz upstream zanjir yangilanishi chiqqach qayta tekshiriladi. Keyingi ko‘rik sanasi: 2026-11-12.

Frontend install policy: root monorepo npm `11.21.0` versiyasiga pin qilindi (`packageManager`/`devEngines`); CI install’dan oldin shu versiyani o‘rnatib tekshiradi. `strict-allow-scripts=true` sabab dependency lifecycle scriptlari default bo‘yicha ishlamaydi; `unrs-resolver@1.12.2` va `fsevents@2.3.2` scriptlari alohida rad etilgan. Toza `npm ci` shu policy bilan lokalda muvaffaqiyatli bajarildi.

Local Compose hardening: development stack’dagi PostgreSQL, Redis, API, dashboard va nginx portlari faqat `127.0.0.1`ga bind qilinadi; host IP ko‘rsatilmasa Compose barcha interfeyslarni tanlaydi ([Docker Compose ports hujjati](https://docs.docker.com/reference/compose-file/services/#ports)). CI effective Compose konfiguratsiyasida barcha besh portning loopback binding’ini tekshiradi. Production Compose o‘zgartirilmadi; u PostgreSQL va Redis’ni published portlarsiz ichki tarmoqda saqlaydi.

2026-10-12 backend hardening: `pip-audit -r requirements.txt` avval 39 advisory yozuvi (6 paket) topdi. FastAPI/Starlette, python-multipart, python-dotenv, pytest toolchain pin’lari yangilandi; `python-jose` JWT-only amaldan PyJWT’ye ko‘chirildi, natijada no-fix `ecdsa` transitive dependency ham olib tashlandi. Eski python-jose bilan yaratilgan HS256 access va refresh tokenlar, expiry va signature tampering uchun moslik testlari bor. Production sozlamalari default kalit namunasini harf registri o‘zgargan/uzaytirilgan holatida ham, 32 baytdan qisqa yoki chekka bo‘shliqli JWT kalitni va `DEBUG=true` qiymatini rad etadi. Yangi alohida CI job Python runtime va test dependency’larini audit qiladi. Lokal yakuniy `pip-audit` natijasi: 0 known vulnerabilities.

### 7-bosqich: Servis xodimi bilan mahalliy pilot

Kod va CI sinovlari biznes oqimi amalda qulay ekanini ko‘rsatmaydi. Demo adminni qabulxona vazifasida ishlatib, mechanic bilan faqat demo tenant hamda sun’iy ma’lumotlardan foydalanib qabul, ta’mir, tayyorlash va topshirish jarayonini tekshirish. Hosting/deploy talab qilinmaydi.

### Checkpoint D

- [ ] Mahalliy pilotning asosiy oqimlari admin (qabulxona vazifasida) va mechanic bilan bajarildi.
- [ ] Natijalar va ishlashga xalaqit beradigan muammolar qayd etildi.
- [ ] Qolgan nuqsonlar tuzatilmaguncha yoki ongli ravishda qabul qilinmaguncha ommaviy deploy qilinmaydi.
