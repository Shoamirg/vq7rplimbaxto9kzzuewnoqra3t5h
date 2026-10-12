# GarageOS: birinchi servis ish oqimi

## Muammo

Bitta servis kun davomida kelgan mashinalar, mijoz shikoyati, bajarilayotgan ish va yakunlangan xizmat tarixini ishonchli yuritishi kerak. Faqat oldindan band qilingan uchrashuvga tayanish yetmaydi, chunki mijoz mashinani navbatsiz ham olib keladi.

## Kim uchun

Hozircha GarageOS’dan bitta servis jamoasi foydalanadi. Asosiy foydalanuvchi — mijoz va mashinani qabul qilib, ishni mexaniklarga topshiradigan servis xodimi.

## Tavsiya etilgan yo‘nalish

Uchrashuv va ish buyurtmasini alohida tushuncha sifatida yuritamiz:

- **Appointment** — rejalashtirilgan vaqt va navbat.
- **Work Order** — servis mashinani qabul qilganidan topshirguniga qadar bajariladigan ta’mir ishi. Uchrashuvga ixtiyoriy ulanadi, ammo navbatsiz ishga ochilishi uchun uchrashuv talab qilinmaydi.

Asosiy oqim: mijozni topish yoki kiritish → uning mashinasini topish yoki kiritish → bronli yoki navbatsiz ish buyurtmasini ochish → ish holatini yuritish → ish tugaganda xizmat tarixiga bir marta yozish.

Ish buyurtmasi mavjud mijoz, mashina, kirish odometri va mijoz aytgan muammo bilan bog‘lanadi. Mexanik biriktirish ixtiyoriy bo‘ladi. Uchrashuv, ish buyurtmasi va yakunlangan xizmat tarixi bir-birining o‘rnini bosmaydi.

## MVP ichida

- Mavjud mijoz va mashinani tanlash; kerak bo‘lsa yangi yozuv kiritish.
- Uchrashuvdan ish buyurtmasi ochish yoki navbatsiz kelgan mashinaga buyurtmani bevosita ochish.
- Faol ishlarni ko‘rish, holatini o‘zgartirish va ish qaydlarini yuritish.
- Buyurtmani yakunlashda xizmat tarixini takrorlanmaydigan tarzda yaratish va odometrni faqat yuqoriroq qiymatga yangilash.
- Mavjud kirish nazorati va servis markazi bo‘yicha ma’lumot ajratilishini saqlash.

## Hozircha kirmaydi

To‘lov va hisob-kitobni qayta loyihalash, ehtiyot qismlar ombori, mijoz portali, Telegram/xabarlar, ko‘p servisli SaaS kengaytmalari va ommaviy deploy. Server masalasi aniq bo‘lmaguncha deploy qilinmaydi; testda namunaviy ma’lumot ishlatiladi.

## Muvaffaqiyat mezoni

- Xodim bron bo‘lmagan mashinaga ham ish buyurtmasini ocha oladi.
- Har bir faol ta’mir mijoz va mashinaga bog‘langan, topish va holatini ko‘rish mumkin.
- Yakunlash qayta yuborilganda xizmat tarixi dublikat bo‘lmaydi; mashina odometri pasaymaydi.
- Foydalanuvchi faqat o‘ziga ruxsat etilgan servis ma’lumotini ko‘radi va o‘zgartiradi.

## Kod tekshiruvidan topilgan muhim nuqta

Hozirgi `Appointment` yakunlash oqimi `ServiceRecord` yaratadi; `Invoice` modelida esa Work Order uchun hozircha ishlatilmaydigan `work_order_id` maydoni zaxiralangan. Shuning uchun yangi oqimni qo‘shishda appointment yakunlash bilan xizmat tarixini yaratish qoidalarini bir joyga muvofiqlashtirish kerak. PR #5 da alohida Work Order modeli yo‘q; uni merge qilishdan oldin PR va CI holatini to‘liq tekshirish lozim.

## Ochiq mahsulot savoli

Mashina mijozga berilishga tayyor bo‘lgan holat bilan mijozga topshirilib ish yopilgan holatni servis alohida kuzatishi kerakmi? Dastlab `tayyor` va `yakunlangan` bosqichlarini ajratishni tavsiya qilaman; batafsil spec’da tasdiqlanadi.
