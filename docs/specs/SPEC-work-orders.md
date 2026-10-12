# Spec: GarageOS ish buyurtmalari

**Modul:** `work-orders`  
**Holat:** egasining ko‘rib chiqishi uchun loyiha  
**Mahsulot yo‘nalishi:** [Birinchi servis ish oqimi](../ideas/garageos-first-service-workflow.md)

## Maqsad

Bitta servis oldindan yozilgan yoki navbatsiz kelgan mashinani qabul qila olsin, ta’mir jarayonini kuzatsin va bajarilgan xizmat tarixini bir marta, to‘g‘ri yozsin. Mijozlar, mashinalar, uchrashuvlar va loginning mavjud qismlaridan foydalanamiz.

## Asos qilib olinayotgan taxminlar

- Dastlab bitta servis jamoasi foydalanadi.
- Mijoz navbatsiz kelishi mumkin; uchrashuv majburiy emas.
- **Appointment** — oldindan belgilangan vaqt. **Work Order** — mashina servisga qabul qilingandan mijozga topshirilguncha davom etadigan ta’mir ishi.
- Tayyor (ready) — ta’mir bajarildi, mashina olib ketishga tayyor. Topshirildi (completed) — mashina mijozga berildi. Xizmat tarixi mashina tayyor bo‘lganda bir marta yaratiladi.
- Buyurtmani ish boshlanishidan oldin bekor qilish mumkin. Ish boshlanganidan keyingi qisman ta’mirni hisobga olish birinchi versiyaga kirmaydi.
- Mexaniklar ilovada o‘z hisobiga ega bo‘ladi; buyurtma matniga yozilgan mexanik ismi ruxsat tekshiruvi hisoblanmaydi.
- Server va ommaviy deploy hozircha yo‘q; tekshiruvda sun’iy ma’lumot ishlatiladi.

## Servisdagi ish tartibi

1. Qabulxona xodimi mijozni qidiradi; topilmasa shu qabul oynasida yangi mijozni kiritadi. Mijozning avtomobili tanlanadi yoki faol marka/model katalogidan yangisi qo‘shiladi.
2. Ish buyurtmasini uchrashuvdan yoki **Navbatsiz qabul** tugmasidan ochadi. Xizmat turini tanlaydi; mijoz aytgan muammo, qabul paytidagi odometr va mexanikni ixtiyoriy kiritadi.
3. Buyurtma faol ishlar ro‘yxatida ko‘rinadi. Qabulxona va rahbar barcha buyurtmalarni, mexanik faqat o‘ziga biriktirilganlarini ko‘radi.
4. Mexanik ishni boshlaydi, bajarilgan ishni qayd etadi va mashinani olib ketishga tayyor deb belgilaydi.
5. Buyurtma tayyor bo‘lganda xizmat tarixi bir marta yoziladi, odometr kerak bo‘lsa oshiriladi va bog‘langan uchrashuv yakunlanadi. Mashina mijozga berilgach, qabulxona buyurtmani yopadi.

## Asosiy funksional talablar

- Yangi buyurtmada `customer_id`, `vehicle_id`, xizmat turi va holat bo‘ladi. `appointment_id`, mexanik, mijoz aytgan muammo va qabul paytidagi odometr ixtiyoriy.
- Uchrashuvdan ochilganda mijoz va mashina o‘sha uchrashuvdagiga mos bo‘lishi, uchrashuv bekor qilinmagan va yakunlanmagan bo‘lishi shart. Bitta uchrashuvga ko‘pi bilan bitta ish buyurtmasi ulanadi; buyurtma ochilganda uchrashuv in_progress bo‘ladi.
- Navbatsiz buyurtmada `appointment_id` bo‘sh qoladi. Buning uchun soxta uchrashuv yaratilmaydi.
- Qabulxona xodimi intake oynasidan yangi mijoz va avtomobil qo‘sha oladi. Backend mijozni joriy servisga bog‘laydi, faqat ruxsatli ofis rollariga yozishga ruxsat beradi, Telegram identifikatorlarini qabul qilmaydi va avtomobil marka/modeli faol katalogga mosligini tekshiradi.
- Buyurtmalar ro‘yxati sahifalab olinadi (`page`, `page_size`) va holat bo‘yicha saralanadi. Boshqa servis markazining yoki o‘chirilgan yozuvlar ko‘rinmaydi.
- Mijoz, mashina va uchrashuv aloqalarini buyurtma ochilgandan keyin almashtirib bo‘lmaydi. Qabulxona `received` holatida mijoz muammosi, qabul odometri va mexanik biriktiruvini kiritishi mumkin. Bajarilgan ish, yakuniy odometr va haqiqiy narx faqat `in_progress` holatida tahrirlanadi; UI ularni ish boshlanguncha o‘chiradi, API esa bevosita yuborilgan erta o‘zgarishni rad etadi.
- Holatlar faqat quyidagicha o‘tadi:
  - `received` — qabul qilindi → `in_progress` — ish boshlandi yoki `cancelled` — bekor qilindi
  - `in_progress` → `ready` — tayyor
  - `ready` → `completed` — mijozga topshirildi
  - `completed` va `cancelled` — yopiq holatlar; ortga qaytmaydi.
- Tayyor holatiga o‘tkazishdan oldin bajarilgan ish yozilishi shart. Shu amal xizmat tarixini, odometrni va uchrashuv holatini bitta ma’lumotlar bazasi tranzaksiyasida yangilaydi. Takroriy so‘rov ikkinchi xizmat tarixi yozuvini yaratmaydi.
- Bog‘langan uchrashuvni yakunlaydigan mavjud API ham shu ready amaliga boradi: uchrashuvdagi notes bajarilgan ish, odometer_km yakuniy odometr, total_cost esa ixtiyoriy haqiqiy narx sifatida olinadi. Bajarilgan ish yozilmagan bo‘lsa API 422 qaytaradi. Ish buyurtmasi yo‘q eski uchrashuvlar amaldagi tartibda ishlashda davom etadi.
- Bekor qilingan buyurtma bog‘langan uchrashuvni ham bekor qiladi, lekin ishlatilgan vaqt oralig‘ini keyin bo‘sh slot qilib ko‘rsatmaydi.
- Odometr manfiy bo‘la olmaydi. Mashinaning saqlanadigan odometri hech qachon pasaymaydi. Yakuniy ko‘rsatkich berilmasa, avval qabul odometri, bo‘lmasa mashinaning hozirgi ko‘rsatkichi ishlatiladi.
- API orqali buyurtmani butunlay o‘chirib bo‘lmaydi.

## API kelishuvi

Backend va veb qismi quyidagi manzillardan foydalanadi. Mavjud loyihadagi `snake_case` maydon nomlari va sahifalangan javob ko‘rinishi saqlanadi.

| Amal | Manzil | Vazifasi |
|---|---|---|
| `GET` | `/api/v1/work-orders` | Holat filtri bilan sahifalangan ro‘yxat |
| `POST` | `/api/v1/work-orders` | Uchrashuvli yoki navbatsiz buyurtma ochish |
| `GET` | `/api/v1/work-orders/{work_order_id}` | Bitta buyurtmani ko‘rish |
| `PATCH` | `/api/v1/work-orders/{work_order_id}` | Maydonlarni yoki holatni ruxsat bilan o‘zgartirish |
| `POST` | `/api/v1/customers` | Qabulxona uchun yangi mijoz kiritish |
| `GET` | `/api/v1/vehicles/catalog` | Faol avtomobil marka va modellari |
| `POST` | `/api/v1/vehicles` | Tanlangan mijozga avtomobil qo‘shish |

Yangi buyurtma so‘rovida customer_id, vehicle_id, service_type va Idempotency-Key bo‘ladi. Bu kalit so‘rovni takrorlashdan himoya qiladi: tarmoq uzilib so‘rov qayta yuborilsa, bir xil kalit va mazmun avvalgi buyurtmani qaytaradi; kalit boshqa mazmun bilan ishlatilsa 409 xatosi qaytadi. Kafolat ma’lumotlar bazasida saqlanadi; Redis ishlamasa so‘rovni baribir davom ettiradigan mavjud yordamchi kodga tayanmaymiz.

Noto‘g‘ri maydon `422`, mumkin bo‘lmagan holat almashishi yoki takroriy uchrashuv `409`, topilmagan yoki boshqa servisga tegishli yozuv `404` beradi. Xatolar mavjud GarageOS domain-error ko‘rinishiga mos qoladi. Buyurtmani tayyorlash qayta yuborilsa o‘sha xizmat tarixini qaytaradi, ikkinchi nusxani yaratmaydi.

## Ma’lumotlar va yaxlitlik

- `work_orders` jadvali servis markazi, mijoz, mashina, ixtiyoriy uchrashuv va mexanik, xizmat turi, muammo/bajarilgan ish, holat, odometrlar, narx, yaratuvchi xodim, vaqtlar hamda idempotency kaliti va so‘rov izi qiymatini saqlaydi.
- Bitta uchrashuvga bitta buyurtma, bitta buyurtmaga bitta xizmat tarixi yozuvi bo‘lishi ma’lumotlar bazasidagi unikal cheklovlar bilan kafolatlanadi. Eski `ServiceRecord` yozuvlariga ta’sir qilmaslik uchun yangi `work_order_id` bo‘sh bo‘lishi mumkin.
- Xizmat tarixi buyurtmaning mashinasi va uchrashuviga ulanadi; xizmat turi va bajarilgan ish matni ko‘chiriladi. `performed_km` yakuniy/qabul/joriy odometrdan olinadi. Haqiqiy narx ixtiyoriy ravishda `cost` maydoniga yoziladi; hisob-faktura yoki pul yechish qilinmaydi.
- Bir vaqtning o‘zida ikkita yakunlash so‘rovi kelsa ham bitta xizmat tarixi qolishi kerak. Faqat oldin tekshirib keyin yozish yetmaydi; holat tekshiruvi va bazaning unikal cheklovi birga ishlaydi.

## Rollar va ma’lumot himoyasi

- Har bir amal login qilgan foydalanuvchining faol servis markazi doirasida bajariladi. `service_center_id` mijoz yuborgan so‘rovdan olinmaydi.
- `admin`, `manager`, `receptionist`: o‘z servisidagi buyurtmalarni ochish, ko‘rish, biriktirish, tahrirlash, bosqichini o‘zgartirish, bekor qilish va yopish.
- Yangi mijoz yoki avtomobilni qabul oynasidan kiritish faqat `admin`, `manager`, `receptionist` rollariga mumkin. Servis markazi ID’si so‘rovdan olinmaydi; mijozning faolligi/egalik chegarasi va faol marka-model jufti backend’da tekshiriladi. Yangi mijoz yaratish Telegram identifikatorlarini qabul qilmaydi.
- `mechanic`: faqat o‘ziga biriktirilgan buyurtmani ko‘rish, ish qaydini kiritish, ishni boshlash va `ready` qilish. Buyurtma ochish, boshqa mexanikka topshirish, bekor qilish va yopish mumkin emas.
- Noma’lum yoki o‘chirilgan rolga ruxsat berilmaydi. `super_admin` belgisi servis markazi chegarasini chetlab o‘tmaydi; MVP’da barcha servislarni kesib ko‘radigan endpoint bo‘lmaydi.
- Mijoz, mashina, uchrashuv va mexanik ID’lari shu servisga tegishliligi tekshiriladi. Mashina tanlangan mijozniki bo‘lishi, mexanik faol va `mechanic` rolida bo‘lishi shart.
- Mexanikka bajarish uchun kerakli mijoz/mashina tafsilotlarigina ko‘rsatiladi; telefon va manzil odatda yashiriladi. Faqat frontend’da tugmani yashirish ruxsat nazorati hisoblanmaydi.
- Buyurtma ochish, biriktirish, bekor qilish, holat o‘zgarishi va xizmat tarixi yaratilishi audit jurnaliga xodim, servis, obyekt ID va amal bilan yoziladi. Mijoz shikoyati, ta’mir matni, parol yoki token audit matniga ko‘chirilmaydi.

## Ekranlar

- Mavjud admin panelda telefon va kompyuterda qulay ishlar ro‘yxati, buyurtma tafsiloti va qabul formasi bo‘ladi.
- Qabulxona uchrashuv sahifasidan ham, navbatsiz qabul tugmasidan ham buyurtma ochadi. Mijoz/mashina qidiruvi mavjud formalarni qayta ishlatadi.
- Holat, mashina, mijoz, mexanik va oxirgi yangilanish aniq ko‘rinadi. Forma label, xato, kutish va klaviatura fokus holatlarini qo‘llaydi.

## Tayyor deb hisoblash mezonlari

- Navbatsiz kelgan mashina uchun uchrashuv yasamasdan buyurtma ochiladi.
- Bir uchrashuvdan ko‘pi bilan bitta buyurtma ochiladi.
- Qabulxona ishni qabuldan tayyor holatgacha, so‘ng topshirishgacha yurita oladi; mexanik faqat biriktirilgan mashinalarini ko‘radi.
- Buyurtma tayyor deb belgilanishi bitta xizmat tarixi yozadi; qayta urinish va parallel so‘rov dublikat hosil qilmaydi.
- URL’dagi ID’ni almashtirib boshqa servisning mijoz, mashina, uchrashuv, buyurtma yoki tarixini ko‘rish/o‘zgartirish imkonsiz.
- Odometr pasaymaydi; ish buyurtmasi ulanmagan eski uchrashuv ham avvalgidek yakunlanadi.
- Backend sinovlari ro‘yxat, ochish, bosqichlar, idempotency, tranzaksiya bekor bo‘lishi, uchrashuv, rollar va servislararo ruxsatni qoplaydi. Brauzer sinovlari navbatsiz va uchrashuvdan kelgan oqimni kompyuter hamda telefon o‘lchamida tekshiradi.

## Bu bosqichga kirmaydi

Hisob-faktura va to‘lov, ehtiyot qismlar ombori, mijoz portali, tashqi xabarlar, xodim akkauntlarini qayta qurish, qisman bajarilgan ishlar hisobi, ko‘p servisli mahsulot kengaytmalari, ommaviy deploy hamda server/domen/HTTPS sozlash.

## Keyingi pilotda tekshiriladi

Ish boshlanganidan keyin uni bekor qilish yoki qisman bajarilgan ishni alohida xizmat tarixi sifatida saqlash servisga zarurmi? Birinchi versiyada bunday amal ataylab taqiqlangan.
