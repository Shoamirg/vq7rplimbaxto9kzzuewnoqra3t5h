# GarageOS’dan kundalik foydalanish

Bu yo‘riqnoma mavjud brauzer va Flutter ilovasi uchun. Tugma nomlari O‘zbekcha
interfeysdan olingan; English yoki Русский tanlansa tarjimasi ko‘rinadi.
Ilovani o‘rnatish, server va yordam aloqasini topshiruvchi operator beradi.
Haqiqiy server, telefon va avtoservisdagi qabul natijasi
[topshirish varag‘ida](HANDOFF.md) alohida qayd etiladi.

## Kim qayerdan kiradi?

| Foydalanuvchi | Kirish joyi | Ish doirasi |
| --- | --- | --- |
| Admin — avtoservis egasi | Brauzer | O‘z servisining mijozlari, navbatlari, hisoblari; xodim va mijoz loginlarini boshqarish |
| Qabul xodimi yoki menejer | Brauzer yoki Flutter’dagi **Xodim** | O‘z servisidagi qabul, ish va hisob oqimi; egaga ajratilgan akkaunt boshqaruvi berilmaydi |
| Usta | Flutter’dagi **Xodim** | **Mening ishlarim**: faqat o‘z akkauntiga tayinlangan ishlarni ko‘rish, boshlash va tugatish |
| Mijoz — avtomobil egasi | Flutter’dagi **Mijoz** | O‘z mashinalari, navbatlari va chiqarilgan hisob/to‘lov tarixini ko‘rish |
| Superadmin | Brauzerdagi platforma paneli | Servislar va global yozuv/statistikalarni ko‘rish; bu panelda yozuvlarni tahrirlash yo‘q |

Har kim o‘z loginidan foydalanadi. Usta akkaunti mijozlar yoki hisoblar umumiy
ro‘yxatini ochmaydi. Mijoz loginini xodim rejimida ishlatib bo‘lmaydi.
Superadmin huquqini avtoservis egasi xodim yaratish sahifasidan bera olmaydi.

## Kirish, til va ulanish

Brauzerda operator bergan HTTPS manzilni ochib, email va parol bilan kiring.
Flutter’da **Xodim** yoki **Mijoz**ni tanlang. **Ulanish sozlamalari → Server
manzili**ga operator bergan `https://sizning-manzilingiz/api/v1` manzilini
kiriting. `/api/v1` qismini saqlang. `10.0.2.2` kompyuterdagi Android emulyatori
uchun; masofadagi telefon uchun haqiqiy server manzili kerak.

Globus tugmasidan O‘zbekcha, English yoki Русский tanlanadi. Flutter tilni shu
qurilmada saqlaydi; til o‘zgarishi kiritilgan ism, izoh, summa yoki valyutani
tarjima qilmaydi. **Chiqish**dan so‘ng qayta kiring. Flutter yopilib qayta
ochilganda ham login kerak: kirish tokenlari doimiy saqlanmaydi.

**Demo rejimni ochish** vaqtinchalik mashq uchun. Undagi o‘zgarishlar serverga
yozilmaydi va chiqish/qayta ochishda tiklanadi. Haqiqiy ishni demo rejimida
qayd etmang.

## Admin: xodim va mijozga kirish berish

Brauzerda **Sozlamalar → Xodim akkauntlari → Xodim qo‘shish**ni oching.
Ism, kirish emaili, boshlang‘ich parol va Usta/Menejer/Qabul xodimi rolini
tanlang. Parol kamida 10 belgi va ko‘pi bilan 72 UTF-8 bayt bo‘lsin.
Login va parolni faqat o‘sha xodimga shaxsiy usulda yetkazing.

Xodimni ism/email orqali topib tahrirlang. **To‘xtatilgan** holati kirishni
va eski sessiyani to‘xtatadi; **Faol** qilishda akkaunt va ish tarixi saqlanadi.
Login emailini o‘zgartirish yoki mavjud parolni tiklash bu sahifada yo‘q.
Egasi o‘z/himoyalangan akkauntini shu yerda to‘xtata olmaydi.

Mijozga kirish berish uchun **Mijozlar**dan uning mavjud profilini oching.
**Mijoz ilovasiga kirish → Mijoz loginini yaratish**da email va boshlang‘ich
parolni kiriting. Parolning chegaralari xodim yaratish bilan bir xil. Bu alohida
mijoz loginidir; xodim huquqini bermaydi. Email/parol va server manzilini aynan
shu mijozga yetkazing. **Parol bilan kirishni to‘xtatish** eski mijoz sessiyasini
bekor qiladi. **Parol bilan kirishni yoqish**dan keyin mijoz qayta kiradi.
Bu amal Telegram bog‘lanishini uzmaydi. O‘zini ro‘yxatdan o‘tkazish yoki parol
tiklash ekrani mavjud emas; unutgan parol bo‘yicha yordam mas’uliga murojaat qiling.

Batafsil: [xodim akkauntlari](STAFF-ACCOUNTS.md),
[avtoservis va egasini dastlab sozlash](PROVISIONING.md).

## Qabul: mijozdan yakuniy hisobgacha

Brauzer yon menyusida **Qabullar**, Flutter’da **Navbat** ochiladi.
Flutter’dagi asosiy ketma-ketlik:

1. **Yangi navbat**da mavjud mijozni ism/telefon bilan qidiring. Yangi bo‘lsa
   **Yangi mijoz** orqali yarating. Telefon takrorlangan xabar chiqsa, avval
   mavjud mijozni qidirib tekshiring.
2. Mijozning mashinasini tanlang yoki **Mashina qo‘shish**da marka/model,
   davlat raqami va kerakli tafsilotlarni kiriting. Raqam/VIN takrorlangan
   xabarda yangi dublikat yaratishdan oldin mavjud mashinani tekshiring.
3. Sana, vaqt, davomiylik va ustani tanlab **Navbat yaratish**ni bosing.
   Bir xil ismli ustalarni email bo‘yicha ajrating; usta telefonida ish
   ko‘rinishi uchun haqiqiy faol akkaunt tanlangan bo‘lsin.
4. **Navbatni tasdiqlash**, keyin **Ishni boshlash**. Bandlik konflikti bo‘lsa
   boshqa vaqt/ustani tanlang. Ish boshlanganidan keyin ustani almashtirish yopiq.
5. Ish yakunida **Ishni tugatish**da xizmat turi, bajarilgan ish izohi va
   kerak bo‘lsa yurgan masofani kiriting. Servis tarixi saqlanadi.
6. Tugagan ish ichida **Hisob yaratish**ni oching. Xizmat/qism/qatorlarni,
   miqdor, birlik narxi va QQSni tekshirib, UZS hisobni saqlang. **Hisobni
   ochish** mavjud hisobga olib boradi; shu navbat uchun yana final hisob
   yaratish o‘rniga uni oching. Usta hisob va to‘lovni rasmiylashtirmaydi.

Flutter’da **Davom etayotgan ishlar** barcha sanalardagi boshlangan va
tugamagan ishlarni, **Hisob kutilayotgan** tugagan va final hisobsiz ishlarni
ko‘rsatadi. Shuning uchun kechagi ishni faqat **Bugun** ro‘yxatidan qidirmang.
Brauzerda tegishli ro‘yxat va filtrlar Qabullar sahifasida joylashgan.

## Hisoblar va to‘lov

Flutter’da **Hisoblar**, brauzerda **To‘lovlar**dan hisobni toping. Hisob raqami,
mijoz, mashina yoki davlat raqami orqali serverdan qidiriladi; eski hisoblar
ham qidiruvga kiradi. Flutter tarixida sahifalar 30 qatorli; **Oldingi sahifa /
Keyingi sahifa**dan foydalaning. Qidiruv o‘zgarsa birinchi sahifa ochiladi.
Ro‘yxat bo‘sh ko‘rinsa qidiruv/filtrni tozalab, yangilang.

Hisob tarkibi, valyuta, jami, qoldiq va **To‘lov tarixi**ni tekshiring.
Flutter’dagi **Mijozga ko‘rsatish** shu qurilmada mijoz uchun ko‘rinishni ochadi.
Brauzerning hisob hujjatida chop etish/PDF va ulashish amallari mavjud.
Ommaviy hisob havolasini faqat tegishli mijozga yuboring.

**To‘lovni qayd etish** mijozdan allaqachon olingan pulni yozadi. Naqd, terminal/
karta yoki bank o‘tkazma usulini va musbat summani tanlang; summa qoldiqdan
oshmasin. Ilova kartadan pul yechmaydi. Qisman to‘lovda qarz qoldig‘i qoladi;
har xil valyutalarni bitta jami sifatida qo‘shmang.

Flutter’da to‘lov javobi kelmay qolsa:

1. Pul yana olinishi yoki boshqa qurilmadan yana yozilishidan oldin shu hisob
   tarixini tekshiring. Formadagi summa/usulni almashtirmang.
2. Ulanish tiklangach o‘sha qurilma, login va server bilan hisobni ochib,
   **To‘lov yozish / tekshirish → Natijani tekshirish**ni bosing. Saqlangan
   so‘rovning natijasi tekshiriladi; yangi to‘lov niyati yaratilmaydi.
3. Javob va to‘lov tarixi/qoldiqni solishtiring. Tekshirish xatosi davom etsa,
   yordam mas’uliga hisob raqami, vaqt, summa va usulni shaxsiy kanal orqali bering.

Kutilayotgan so‘rov hal bo‘lguncha ilovani o‘chirmang, ma’lumotlarini tozalamang
va boshqa API/login bilan davom ettirmang: so‘rov shu qurilma/akkaunt/serverga
bog‘langan. Internet uzilganda yangi yozuvlarni keyin yuboradigan offline navbat
yo‘q. Bu tiklash yo‘li Flutter to‘lov formasiga tegishli; brauzerdagi noma’lum
natijada avval hisob tarixini tekshirib operator bilan aniqlashtiring.

## Usta va mijozning telefoni

Usta **Xodim** orqali kirib, **Mening ishlarim**dan tayinlangan ishni ochadi.
Tasdiqlangan ishni boshlaydi, tugatishda xizmat/izoh/yurgan masofani saqlaydi.
Ish ko‘rinmasa admin faol usta akkauntini, tayinlovni va ish holatini tekshiradi.
Eski matnli usta ismi akkaunt tayinlovi o‘rnini bosmaydi.

Mijoz **Mijoz** orqali admin bergan login bilan kiradi. **Mashinalarim**,
**Navbatlar**, **Hisoblar**da o‘z yozuvlarini ko‘radi; hisobni ochib tarkib va
to‘lov/avans/qaytarish tarixini o‘qiydi. Qidiruv matnidan keyin klaviaturadagi
Enter/tasdiqlashni bosing; sahifa tugmalaridan foydalaning. **Yangilash** yoki
xatodagi **Qayta urinish** ro‘yxatni qayta oladi. Qoralama hisob va ichki xodim
izohlari ko‘rsatilmaydi. Yangi navbat yaratish, to‘lov yozish yoki mashinani
tahrirlash uchun qabul xodimiga murojaat qilinadi.

Superadmin brauzerda yozuv turini, qidiruvni, sanalar va avtoservisni tanlab
global ro‘yxat/statistikani ko‘radi. Hisob chiqarilgan sana va pul olingan sana
alohida; summalar valyuta bo‘yicha ajratilgan. Platforma paneli mijoz yoki xodim
nomidan amal bajarish/akkaunt yaratish vositasi emas.

## Xato bo‘lsa

| Xabar yoki holat | Amal |
| --- | --- |
| Email/parol noto‘g‘ri yoki kirish yopilgan | Xodim/Mijoz tanlovi, login va serverni tekshiring; admin akkaunt faolligini tekshirsin |
| Kirish muddati tugadi | O‘z login bilan qayta kiring; kutilayotgan to‘lovni o‘sha hisobda tekshiring |
| Serverga ulanib bo‘lmadi / javob kelmadi | Internet va operator bergan HTTPS API manzilini tekshiring; yozish natijasi noma’lum bo‘lsa avval mavjud yozuvni tekshiring |
| Ish holati o‘zgargan / vaqt band | Ro‘yxatni yangilang, joriy holat/tayinlovni tekshirib boshqa mos vaqtni tanlang |
| To‘lov qoldiqdan oshdi | Hisob va to‘lov tarixini yangilang; boshqa xodim yozgan to‘lovni ham tekshiring |
| Ruxsat yo‘q / yozuv topilmadi | Admin bilan rol, tayinlov yoki tanlangan servisni tekshiring; boshqa servis yozuviga kirish berilmaydi |
| So‘rovlar ko‘paydi | Biroz kutib qayta urinib ko‘ring; kirishni ketma-ket bosmang |
| Kiritilgan forma saqlanmagan | Saqlang yoki **Saqlamasdan chiqish**ni ongli tanlang; kiritilgan matn avtomatik serverga yozilmaydi |

Yordam mas’uliga ilova versiyasi, telefon/OS yoki brauzer, hodisa vaqti,
qaysi amal bajarilgani, xabar matni va takrorlash qadamlarini bering. Parol,
token, kalit yoki mijozlarning umumiy ro‘yxatini yubormang. Kerakli yozuv
identifikatori va shaxsiy ma’lumot faqat kelishilgan yopiq kanal orqali beriladi.
Yordam manzili va mas’ulini operator [topshirish varag‘iga](HANDOFF.md) yozadi.
