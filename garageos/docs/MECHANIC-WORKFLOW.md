# Admin tayinlovi va ustaning shaxsiy ishlari

Adminning brauzerdagi tayinlovi va ustaning Android/iOS Flutter oqimi.
Admin xodim akkauntini [Sozlamalar orqali](STAFF-ACCOUNTS.md) yaratishi mumkin;
operatorning dastlabki provisioning yo‘li ham saqlanadi. Mijoz login/tarixi va
superadminning ko‘rish paneli alohida mavjud oqimlardir. Kundalik rollar va
kirish uchun [foydalanish yo‘riqnomasiga](USER-GUIDE.md) qarang.

## Foydalanish

1. Operator provisioning orqali `mechanic` akkaunti mavjud bo‘lsin.
2. Admin brauzerdagi Navbatlar sahifasida kutilayotgan yoki tasdiqlangan
   ishni ochib, “Tahrirlash / usta tayinlash”da haqiqiy usta akkauntini tanlaydi.
   Bir xil ismli ustalar email bilan ajratiladi. Saqlash tayinlovni akkauntga bog‘laydi.
3. Navbat tasdiqlangach, usta o‘z login/paroli bilan Flutter ilovasiga kiradi.
   “Mening ishlarim” barcha sanalardagi faqat unga tayinlangan ishlarni ko‘rsatadi.
4. Usta ishni ochib boshlaydi. Tugatishda servis turi, izoh va odometrni kiritishi
   mumkin. Hisob narxlari va to‘lovlarni admin yuritadi.
5. Usta tugatgan ish admin panelida tugagan holatga o‘tadi; admin mavjud oqimda
   bitta yakuniy UZS hisob yaratadi va olingan to‘lovni qayd etadi.

## Eski yozuvlar va tayinlov o‘zgarishi

- Migratsiya eski usta ismlari va ishlarni saqlaydi; ism bo‘yicha avtomatik
  akkaunt tanlamaydi. Eski ishni ustaga ochish uchun admin akkauntni aniq tanlaydi.
- Usta almashtirilsa yoki ismli eski tayinlovga qaytilsa, oldingi akkaunt ishga
  kira olmaydi. Sana/vaqtning oddiy tahriri akkaunt tayinlovini saqlaydi.
- Ism orqali yuritilgan slotga ko‘chirish tayinlov ID sini tozalaydi: slotning
  ismi akkaunt egasi ekanini isbotlamaydi. Admin qaytadan akkaunt tanlaydi.
- Ish boshlangach tayinlov yopiq. Bitta ish ikki marta tugatilmaydi.
- Bir xil ismli ikki haqiqiy usta mustaqil bandlikka ega. Eski ismli bandlik
  esa ehtiyotkorlik bilan hisobga olinadi; uni akkauntga bog‘lab aniqlashtiring.

## API va huquqlar

- `GET /api/v1/mechanics`: operatorning o‘z servisidagi faol usta akkauntlari.
- `PATCH /api/v1/appointments/{id}/assign-mechanic`: `mechanic_user_id` yoki
  eski `mechanic_name`; ikkisi birga yuborilmaydi.
- `PATCH /api/v1/appointments/{id}` ham akkaunt IDsi bilan tayinlashni qo‘llaydi.
- `GET /api/v1/mechanic/work`: qidiruv, holat va sahifalash; har sahifada 1–100 ish.
- `GET /api/v1/mechanic/work/{id}`: faqat o‘ziga tayinlangan ish.
- `PATCH /api/v1/mechanic/work/{id}/start` va `/complete`: tayinlov va holat
  bloklangan yozuvda tekshiriladi. Complete narx maydonini qabul qilmaydi.
- Usta uchun `work.read.assigned`, `work.write.assigned`; umumiy `staff.read`
  yoki `staff.write` yo‘q. Mijoz/hisob/assignment APIlariga kirish 403,
  boshqa usta yoki servis ishi 404, takroriy holat o‘zgarishi 409.

API/migratsiya, Flutter va brauzer clientini birga yangilang. Usta eski umumiy
paneldan kirgan bo‘lsa, chiqib yangilangan ilovada qayta kirsin.

## Topshirish chegarasi

HTTP/PostgreSQL va Flutter workflow sinovi signed Android/iPhone yoki haqiqiy
avtoservis piloti dalili emas. Operator akkauntlari, server, release signing,
qurilma sinovi, backup/tiklash va pilot delivery rejasida alohida qoladi.
