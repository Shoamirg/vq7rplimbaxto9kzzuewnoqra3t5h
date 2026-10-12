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
- [ ] Mijoz, mashina, appointment va mechanic faol va shu tenantniki; mashina shu mijozga tegishli.
- [ ] Appointment faqat ochiq/yaroqli statusda ulanadi va yaratishda `in_progress` bo‘ladi; ikkinchi buyurtma 409.
- [ ] Bir kalit + bir xil mazmun avvalgi buyurtmani, boshqa mazmun 409’ni qaytaradi; kalitsiz so‘rov 422.

**Tekshiruv:** TDD API/service testlari (valid, invalid/cross-tenant, duplicate, idempotent retry); pytest.
**Bog‘liqlik:** Task 1.
**Taxminiy fayllar:** work order schema/repository/service/endpoint/router, exceptions, testlar.
**Hajm:** O‘rta, API route va create service’ni alohida commit qilish mumkin.

## Task 3: Ro‘yxat, tafsilot va mexanik ko‘rinishi

**Tavsif:** Paginated/status-filter GET API va role bo‘yicha ko‘rinish qoidalarini qo‘shish.

**Qabul mezonlari:**
- [ ] Boshqa tenant resource’lari 404; mechanic faqat assigned buyurtmalarini ko‘radi.
- [ ] Mechanic response’da customer phone/address bo‘lmaydi; reception/admin to‘liq o‘z tenant ma’lumotini ko‘radi.
- [ ] Unknown/inactive role rad etiladi.

**Tekshiruv:** role, pagination, 404 tenant isolation va response privacy testlari; pytest.
**Bog‘liqlik:** Task 2.
**Taxminiy fayllar:** endpoint/service/repository, API tests.
**Hajm:** Kichik-o‘rta.

## Task 4: Yangilash, holat o‘tishlari va history

**Tavsif:** Work order patch transition’lari, `ready` tranzaksiyasi, odometer, bitta ServiceRecord, appointment completion va auditni yakunlash.

**Qabul mezonlari:**
- [ ] `received -> in_progress/cancelled -> ready -> completed` qoidasi server tomonda majburiy.
- [ ] Mechanic faqat o‘z buyurtmasidagi ish matni/start/ready’ni boshqaradi; assign/cancel/close qilolmaydi.
- [ ] Ready uchun work performed talab qilinadi; tarix bitta, odometer kamaymaydi, appointment linked bo‘lsa completed.
- [ ] Bog‘lanmagan eski appointment complete ishlashda davom etadi; linked appointment complete ish order ready oqimiga delegatsiya qiladi.

**Tekshiruv:** TDD transition, replay/concurrency uniqueness, rollback, odometer, legacy regressiya va audit testlari; pytest.
**Bog‘liqlik:** Task 1-3.
**Taxminiy fayllar:** work order service/repository, appointment service, API route, migration/model, testlar.
**Hajm:** O‘rta, lifecycle va audit bo‘laklarini alohida commit qilish mumkin.

## Checkpoint A — Backend write/read asoslari

- [ ] Task 1-3 bajarildi va commitlar mavjud.
- [ ] Model/migration, create/list/detail, idempotency va tenant/role tests o‘tdi.

## Task 5: Ishlar navbati va navbatsiz qabul UI

**Tavsif:** `/work-orders` queue hamda mavjud mijoz/mashina lookup’dan foydalanuvchi walk-in intake’ni responsive tarzda qurish.

**Qabul mezonlari:**
- [ ] Active/status queue pagination/filter bilan ishlaydi; details va error/loading/empty state ko‘rinadi.
- [ ] Navbatsiz intake soxta appointment yaratmaydi va idempotency key yuboradi.
- [ ] Mechanic ko‘rinishi faqat o‘z ishlariga mos, PII ko‘rsatmaydi; klaviatura label/focus holatlari mavjud.

**Tekshiruv:** TypeScript/lint/build; Playwright walk-in intake va mobil layout.
**Bog‘liqlik:** Task 2-4.
**Taxminiy fayllar:** app-router page, work-order components, api types, dictionary, sidebar, E2E test.
**Hajm:** O‘rta.

## Task 6: Appointment handoff, mechanic actions va browser E2E

**Tavsif:** Appointment sahifasidan work order yaratish, bog‘langan statusni ko‘rsatish, ishni boshlash/tayyorlash/yopish boshqaruvlari va E2E.

**Qabul mezonlari:**
- [ ] Uchrashuvdan work order yaratilganda customer, vehicle va appointment to‘g‘ri bog‘lanadi.
- [ ] Takroriy appointment bog‘lash UI va API’da xavfsiz rad qilinadi.
- [ ] Mexanik ishni tayyor holatga olib keladi, qabulxona topshirilgach yopadi; phone/address UI’da ko‘rinmaydi.

**Tekshiruv:** Playwright walk-in va appointment handoff (desktop/mobile); to‘liq backend tests; frontend production build.
**Bog‘liqlik:** Task 5.
**Taxminiy fayllar:** appointment list/detail controls, work order components, i18n, E2E.
**Hajm:** O‘rta.

## Checkpoint B — Pilot uchun to‘liq oqim

- [ ] Tasdiqlangan spec qabul mezonlari qoplandi; backend, brauzer va build tekshiruvlari o‘tdi.
- [ ] Xavfsizlik va diff review bajarildi; deploy qilinmadi.
