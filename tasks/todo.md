# GarageOS ish buyurtmalari — vazifalar

## Task 1: Model va migration

**Tavsif:** WorkOrder jadvali va ServiceRecord bilan birga-bir aloqani qo‘shib, tenant, appointment va idempotency invariantlarini DB’da kafolatlash.

**Qabul mezonlari:**
- [x] WorkOrder barcha spec maydonlarini, tenant yaratish vaqtlarini va creator aloqasini saqlaydi.
- [x] Bir servisdagi appointment ko‘pi bilan bitta ish buyurtmasiga, ish buyurtmasi ko‘pi bilan bitta ServiceRecord’ga ulanadi.
- [x] Eski ServiceRecord’lar uchun `work_order_id` nullable; migration downgrade/upgraded bo‘ladi.

**Tekshiruv:** model metadata testi, migration SQL offline generation; pytest.
**Bog‘liqlik:** Yo‘q.
**Taxminiy fayllar:** `garageos/backend/app/models/work_order.py`, `service_record.py`, `models/__init__.py`, Alembic revision, model test.
**Hajm:** O‘rta.

## Task 2: Ish buyurtmasini yaratish va idempotency

**Tavsif:** Uchrashuvga bog‘liq yoki navbatsiz ish buyurtmasini server tomonda ownership tekshiruvlari va DB’da saqlanadigan idempotency bilan ochish.

**Qabul mezonlari:**
- [x] Mijoz, mashina, appointment va mechanic faol va shu tenantniki; mashina shu mijozga tegishli.
- [x] Appointment faqat ochiq/yaroqli statusda ulanadi va yaratishda `in_progress` bo‘ladi; ikkinchi buyurtma 409.
- [x] Bir kalit + bir xil mazmun avvalgi buyurtmani, boshqa mazmun 409’ni qaytaradi; kalitsiz so‘rov 422.

**Tekshiruv:** TDD API/service testlari (valid, invalid/cross-tenant, duplicate, idempotent retry); pytest.
**Bog‘liqlik:** Task 1.
**Taxminiy fayllar:** work order schema/repository/service/endpoint/router, exceptions, testlar.
**Hajm:** O‘rta, API route va create service’ni alohida commit qilish mumkin.

## Task 3: Ro‘yxat, tafsilot va mexanik ko‘rinishi

**Tavsif:** Paginated/status-filter GET API va role bo‘yicha ko‘rinish qoidalarini qo‘shish.

**Qabul mezonlari:**
- [x] Boshqa tenant resource’lari 404; mechanic faqat assigned buyurtmalarini ko‘radi.
- [x] Mechanic response’da customer phone/address bo‘lmaydi; reception/admin to‘liq o‘z tenant ma’lumotini ko‘radi.
- [x] Unknown/inactive role rad etiladi.

**Tekshiruv:** role, pagination, 404 tenant isolation va response privacy testlari; pytest.
**Bog‘liqlik:** Task 2.
**Taxminiy fayllar:** endpoint/service/repository, API tests.
**Hajm:** Kichik-o‘rta.

## Task 4: Yangilash, holat o‘tishlari va history

**Tavsif:** Work order patch transition’lari, `ready` tranzaksiyasi, odometer, bitta ServiceRecord, appointment completion va auditni yakunlash.

**Qabul mezonlari:**
- [x] `received -> in_progress/cancelled -> ready -> completed` qoidasi server tomonda majburiy.
- [x] Mechanic faqat o‘z buyurtmasidagi ish matni/start/ready’ni boshqaradi; assign/cancel/close qilolmaydi.
- [x] Bajarilgan ish, yakuniy odometr va haqiqiy narx faqat buyurtma `in_progress` bo‘lganda tahrirlanadi; UI va API erta o‘zgarishni bloklaydi.
- [x] Ready uchun work performed talab qilinadi; tarix bitta, odometer kamaymaydi, appointment linked bo‘lsa completed.
- [x] Bog‘lanmagan eski appointment complete ishlashda davom etadi; linked appointment complete ish order ready oqimiga delegatsiya qiladi.

**Tekshiruv:** TDD tests cover transitions, replay, roles, odometer, legacy compatibility and audit; SQL lock queries and offline migration verified. PostgreSQL integration is needed for concurrent transaction/rollback tests.
**Bog‘liqlik:** Task 1-3.
**Taxminiy fayllar:** work order service/repository, appointment service, API route, migration/model, testlar.
**Hajm:** O‘rta, lifecycle va audit bo‘laklarini alohida commit qilish mumkin.

## Checkpoint A — Backend write/read asoslari

- [x] Task 1-3 bajarildi va commitlar mavjud.
- [x] Model/migration, create/list/detail, idempotency va tenant/role tests o‘tdi.

## Task 5: Ishlar navbati va navbatsiz qabul UI

**Tavsif:** `/work-orders` queue hamda mavjud mijoz/mashina lookup’dan foydalanuvchi walk-in intake’ni responsive tarzda qurish.

**Qabul mezonlari:**
- [x] Active/status queue pagination/filter bilan ishlaydi; details va error/loading/empty state ko‘rinadi.
- [x] Navbatsiz intake soxta appointment yaratmaydi va idempotency key yuboradi.
- [x] Mechanic ko‘rinishi faqat o‘z ishlariga mos, PII ko‘rsatmaydi; klaviatura label/focus holatlari mavjud.
- [x] Qidiruvda topilmagan mijozni qabul oynasidan yaratish va shu servisga marka/model katalogidan avtomobil qo‘shish mumkin; backend ofis rolini, tenant egaligini va kiritilgan ma’lumotlarni tekshiradi.

**Tekshiruv:** `npx tsc --noEmit`, lint, i18n check, production build; 130 backend testi va sintetik demo PostgreSQL/real lokal API bilan 13 Playwright sinovi, jumladan yangi mijoz-avtomobil qabul oqimi, mobil layout hamda appointment handoff.
**Bog‘liqlik:** Task 2-4.
**Taxminiy fayllar:** app-router page, work-order components, api types, dictionary, sidebar, E2E test.
**Hajm:** O‘rta.

## Task 6: Appointment handoff, mechanic actions va browser E2E

**Tavsif:** Appointment sahifasidan work order yaratish, bog‘langan statusni ko‘rsatish, ishni boshlash/tayyorlash/yopish boshqaruvlari va E2E.

**Qabul mezonlari:**
- [x] Uchrashuvdan work order yaratilganda customer, vehicle va appointment to‘g‘ri bog‘lanadi.
- [x] Takroriy appointment bog‘lash UI va API’da xavfsiz rad qilinadi.
- [x] Mexanik ishni tayyor holatga olib keladi, qabulxona topshirilgach yopadi; phone/address UI’da ko‘rinmaydi.

**Tekshiruv:** Seeded, izolyatsiyalangan lokal PostgreSQL’da to‘liq backend suite — 130 test — o‘tdi; real API bilan Playwright E2E suite — 13 test — o‘tdi, jumladan walk-in uchun yangi mijoz va avtomobil yaratish, mobil status oqimi va appointment handoff. Frontend lint, i18n, TypeScript tekshiruvi va production build o‘tdi.
**Bog‘liqlik:** Task 5.
**Taxminiy fayllar:** appointment list/detail controls, work order components, i18n, E2E.
**Hajm:** O‘rta.

## Checkpoint B — Pilot uchun to‘liq oqim

- [x] Tasdiqlangan spec qabul mezonlari qoplandi; backend, brauzer va build tekshiruvlari o‘tdi.
- [x] Next.js 16, Tailwind CSS 4, ESLint 10 va Node.js 24’ga migratsiya qilindi; production dependency audit toza.
- [ ] Dev dependency audit’dagi qolgan yuqori xavf upstream tuzatilmaguncha chiqarishdan oldin qayta tekshirilsin; deploy qilinmadi.

**Qolgan xavfsizlik darvozasi:** `npm audit --omit=dev` 0 zaiflik ko‘rsatdi. To‘liq `npm audit` esa ESLint/Next lint tooling dependency tree ichidagi `braces <=3.0.3` uchun 5 high yozuv ko‘rsatmoqda (`GHSA-vfj7-8cjw-p6xm`); advisory’da tuzatilgan versiya ko‘rsatilmagan. Bu ishlab chiqarish dependency tree’iga kirmaydi, ammo dev tooling audit’ini yopmaydi. Checkpoint B release uchun ochiq qoladi; production deploy qilinmagan.

## Task 7: Mahalliy servis pilot sinovi

**Tavsif:** Demo admin hisobida qabulxona ishini, mechanic hisobida o‘ziga biriktirilgan ishlarni mahalliy, sun’iy ma’lumotli muhitda tekshirish.

**Qabul mezonlari:**
- [ ] Navbatsiz qabul va yangi mijoz/avtomobil oqimi admin hisobida qabulxona vazifasida tushunarli ishlaydi; mechanic o‘ziga biriktirilgan ishni yurita oladi.
- [ ] Ready yakunida bitta xizmat tarixi qoladi; demo mechanic boshqa mexanik ishini yoki mijoz telefon/manzilini ko‘rmaydi.
- [ ] Telefon ekranida asosiy qabul va buyurtma amallari ishlaydi; topilgan muammolar qayd etiladi.

**Tekshiruv:** [Lokal demo qo‘llanmasi](../garageos/docs/setup/local-demo.md) bilan muhitni ishga tushirib, [pilot ro‘yxati](../docs/testing/work-order-pilot-checklist.md) bo‘yicha admin (qabulxona vazifasida) va mechanic bilan tekshirish; faqat sun’iy ma’lumot va localhost. Deploy talab qilinmaydi.
**Bog‘liqlik:** Task 1-6.
**Taxminiy fayllar:** Pilot natijasiga qarab aniqlanadi.
**Hajm:** Kichik, sinov natijasiga qarab keyin alohida tuzatishlar ochiladi.

## 2026-10-13 tekshiruv qaydi

- Mahalliy brauzer regressiya to‘plami: 17/17 Playwright testi o‘tdi; TypeScript va production build o‘tdi; lint’da xato yo‘q, 2 ta mavjud rasm ogohlantirishi qoldi.
- GitHub Actions 38346548668 tekshiruvi 4760e97 commit uchun muvaffaqiyatli yakunlandi.
- Agent bajargan sun’iy ma’lumotli smoke-test buyurtmani topshirishgacha olib bordi va bitta xizmat tarixi yozuvini tasdiqladi. Servis xodimi bilan amaliy pilot hali bajarilmadi; pilot ro‘yxati ochiq.
- Production dependency auditi: 0 zaiflik. To‘liq auditda `braces@3.0.3` development zanjiridan 5 ta yuqori darajali ogohlantirish bor; tuzatilgan versiya chiqsa, chiqarishdan oldin qayta tekshirish kerak.
