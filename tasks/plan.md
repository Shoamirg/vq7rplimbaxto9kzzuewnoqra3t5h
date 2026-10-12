# Implementation Plan: GarageOS ish buyurtmalari

## Maqsad

Tasdiqlangan `docs/specs/SPEC-work-orders.md` bo‘yicha bitta servis uchun uchrashuvdan yoki navbatsiz ochiladigan ish buyurtmalarini qurish. Backend mavjud mijoz, mashina, uchrashuv, xodim, xizmat tarixi va audit modellariga ulanadi; admin panelda qabul, navbat va topshirish oqimi ishlaydi. Deploy bu ish doirasiga kirmaydi.

## Arxitektura qarorlari

- FastAPI endpointlari `get_tenant_uow` va tenant-scoped repository naqshidan foydalanadi. Ruxsat server tomonda tekshiriladi; tenant ID faqat autentifikatsiyalangan xodimdan olinadi.
- `WorkOrder` alohida ORM modeli bo‘ladi. Bazada appointment uchun partial unique constraint, idempotency uchun `(service_center_id, idempotency_key)` unique constraint, `ServiceRecord.work_order_id` uchun unique constraint qo‘llanadi.
- Yaratish idempotency-si Redis’ga emas, shu tranzaksiyada saqlanadigan kalit va canonical request fingerprint’ga tayanadi.
- `ready` transition buyurtma, xizmat tarixi, odometr, bog‘langan uchrashuv va audit yozuvini bitta UnitOfWork tranzaksiyasida boshqaradi. DB unique constraint parallel takrorni yakuniy himoya qiladi.
- Buyurtmaga bog‘lanmagan uchrashuvlarni yakunlashning eski yo‘li saqlanadi. Bog‘langan uchrashuv uchun eski endpoint yangi `ready` oqimiga yo‘naltiriladi.
- Admin panel mavjud Next.js app-router, `clientFetch`, dizayn tizimi va uch tildagi staff dictionary’ni davom ettiradi. Testlarda haqiqiy API/demodagi ma’lumot ishlatiladi; production deploy qilinmaydi.

## Amalga oshirish ketma-ketligi

### 1-bosqich: Jadval va invariantlar

`WorkOrder` modeli, migration va `ServiceRecord.work_order_id` aloqasini qo‘shish. Bazadagi unikal cheklovlar va indekslarni metadata/migration tekshiruvlari bilan tasdiqlash.

### 2-bosqich: Qabul qilish va navbatsiz yaratish

API request/response, tenant repository, mijoz-mashina-uchrashuv-mexanik ownership tekshiruvi, idempotency va audit bilan yaratishni test-first va kichik bo‘laklarda qurish. Uchrashuvga ikkinchi buyurtma ochilmasin; bir xil kalit va mazmun mavjud yozuvni qaytarsin.

### Checkpoint A

- [ ] Model/migration va create oqimi testdan o‘tadi.
- [ ] Bir servis doirasidagi aloqalar va qayta yuborish qoidalari isbotlangan.
- [ ] Migration offline SQL hosil qiladi.

### 3-bosqich: Ro‘yxat va tafsilot

Sahifalangan, status filter’li tenant-safe GET endpointlar. Mexanik faqat o‘ziga biriktirilgan buyurtmani ko‘radi va serializatsiyada mijoz telefoni/manzili chiqmaydi.

### 4-bosqich: Holat va xizmat tarixi

Ruxsatli holat o‘tishlari, completion odometri, bajarilgan ish va narxni yangilash; `ready` paytida xizmat tarixini bir marta yozish. Uchrashuvni yakunlash endpointini bog‘langan/yangi eski oqimlarga xavfsiz ajratish. Parallel/takroriy finalize va rollback holatlarini tekshirish.

### Checkpoint B

- [ ] Walk-in va appointment-linked buyurtma API orqali end-to-end tasdiqlangan.
- [ ] Takroriy ServiceRecord yaratib bo‘lmaydi; odometer pasaymaydi.
- [ ] Legacy appointment complete yo‘li testdan o‘tadi.
- [ ] Role va cross-tenant testlari o‘tadi.

### 5-bosqich: Admin panel ish navbati

`/work-orders` sahifasi, status navbati, tafsilot kartasi va navbatsiz qabul formasi. Mavjud mijoz/mashina qidiruvi va xodimlar ro‘yxatidan foydalanish, yuklanish/xato/bo‘sh holatlari va mobil layoutni qo‘shish.

### 6-bosqich: Uchrashuv bilan bog‘lash va brauzer tekshiruvi

Uchrashuv ekranidan buyurtma yaratish va buyurtma holatini ko‘rish. Reception va mechanic rollariga mos boshqaruvlarni ko‘rsatish. Playwright’da walk-in hamda appointment oqimini tekshirish.

### Checkpoint C

- [ ] Backend testlar va frontend lint/build o‘tadi.
- [ ] Desktop/mobile brauzer oqimlari muvaffaqiyatli.
- [ ] Diff xavfsizlik, accessibility, tenant chegarasi va scope bo‘yicha yakuniy ko‘rib chiqilgan.

## Xatarlar va kamaytirish

| Xatar | Ta’sir | Kamaytirish |
|---|---|---|
| Mavjud demo DB migration’dan orqada yoki testlar DB’ga bog‘liq | Testlar lokalda ishga tushmasligi mumkin | Avval DB/migration holatini aniqlash; backend testlarini mavjud fixture naqshida yozish, migration offline tekshiruvi bilan ajratish |
| Appointment complete eski flow xizmat tarixini bir marta yozadi, lekin retry/concurrency guard yo‘q | Dublikat yoki takroriy yakunlash | Faqat work order bog‘langan holatni yangi tranzaksiyaga yo‘naltirish; legacy holatni regressiya testi bilan saqlash |
| API endpointlarda mavjud role dependency yo‘q | Ruxsatsiz amal | Work order endpointlarda aniq role policy va assigned-mechanic tekshiruvi; UI yashirishni yagona himoya qilmaslik |
| DB parallel create/finalize poygasi | Ikki ish buyurtmasi yoki history | Partial/ordinary unique constraint va tranzaksiya ichidagi state check; IntegrityError’ni domain 409 ga aylantirish |
| Demo read-only middleware mutatsiyani bloklaydi | E2E create flow ishlamaydi | E2E setup’ni mutatsiya qilish mumkin bo‘lgan test akkauntiga moslash; demo token uchun read-only xatti-harakatni alohida tekshirish |

## Ochiq masala

- Pilotda `in_progress` holatidan keyin bekor qilish/qisman bajarilgan xizmatni qayd etish kerakmi — MVP’da hozircha yo‘q.
