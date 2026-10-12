# Ish buyurtmasi oqimi — mahalliy pilot tekshiruv ro‘yxati

**Maqsad:** servis xodimi bilan kundalik qabul va ta’mir oqimi tushunarli hamda amaliy ekanini tekshirish. Bu qo‘lda qabul sinovi; CI’dagi avtomatik testlar o‘rnini bosmaydi.

Lokal demoni yoqish bosqichlari: [Lokal demo qo‘llanmasi](../../garageos/docs/setup/local-demo.md).

## Sinovdan oldin

- Faqat alohida, mahalliy demo muhitidan foydalaning. Brauzer manzili localhost yoki 127.0.0.1 bo‘lsin; ommaviy domen/server ishlatmang.
- Faqat sun’iy mijoz, telefon va avtomobil raqamlaridan foydalaning. Haqiqiy mijoz ma’lumotlarini demo bazaga kiritmang.
- Sinovni admin hisobida qabulxona ishini bajarib, alohida mechanic demo hisobida mexanik oqimini tekshirib bajaring. Hozir demo seed receptionist hisobini yaratmaydi; receptionist ruxsatlari avtomatik backend testlarida qamrab olingan. Seed hisoblari faqat test uchun; hammaga ma’lum demo parolni ommaviy serverda hech qachon ishlatmang.
- Mahalliy bazada kerakli sinov ma’lumoti borligini tasdiqlang. make demo va make reset ma’lumotlar hajmini o‘chirib yangi demo baza yaratadi; mavjud yoki ulashilgan bazada ularni ishga tushirmang.
- Bu pilotda to‘lov, invoice yoki haqiqiy mijozga xabar yuborish bo‘lmaydi.

## Tekshiruv qadamlari

Har bir qadamdan keyin O‘tdi, Xato yoki Sinab bo‘lmadi deb belgilang. Muammo chiqqanda keyingi qadamga o‘tishdan oldin yozib oling.

### 1. Navbatsiz qabul — mavjud mijoz va avtomobil

- [ ] Admin (qabulxona) /work-orders sahifasidan yangi New walk-in buyurtma ochadi.
- [ ] Demo mijoz va unga tegishli avtomobilni tanlaydi, xizmat turini va mijoz aytgan muammoni kiritadi.
- [ ] Saqlangach yangi buyurtma received holatida ko‘rinadi, mijoz va avtomobil mos, appointment ulanmagan.
- [ ] Sahifani yangilaganda buyurtma saqlanib qoladi; yana bir xil buyurtma o‘z-o‘zidan yaralmaydi.

### 2. Navbatsiz qabul — yangi mijoz va avtomobil

- [ ] Qidiruvda topilmaydigan sun’iy nomli mijoz yaratib, demo katalogidan marka/model tanlab unikal sun’iy raqamli avtomobil qo‘shadi.
- [ ] Shu mijoz va avtomobilga buyurtma ochadi; tizim uchrashuv yaratmaydi.
- [ ] Mijoz, avtomobil va buyurtma to‘g‘ri bir-biriga bog‘langanini tekshiradi.

### 3. Mexanikning o‘z ishi

- [ ] Admin (qabulxona) buyurtmani demo mechanic’lardan biriga biriktiradi.
- [ ] Mexanik login qilib, o‘ziga biriktirilgan buyurtmani ko‘radi; boshqa mexanikning ishini ko‘rmaydi.
- [ ] Mexanik ekranida mijozning telefon raqami va manzili chiqmaydi.
- [ ] Ish boshlanishidan oldin Work performed, completion odometer va actual cost maydonlari tahrirlanmaydi.
- [ ] Mexanik Start work qiladi; bajarilgan ishni qayd etadi va buyurtmani Mark ready qiladi.

### 4. Tayyorlash va topshirish

- [ ] Ready qilishdan oldin bajarilgan ish matni talab qilinadi.
- [ ] Sinov avtomobili uchun qabul odometridan kichik yakuniy qiymat rad etilishini tekshiradi; keyin qabul odometriga teng yoki undan katta qiymat bilan davom etadi.
- [ ] Ready holatidan keyin mashina uchun xizmat tarixi bitta yozuv bo‘lib yaratilganini ko‘radi; buyurtmani qayta ochib/yangilab dublikat paydo bo‘lmaganini tasdiqlaydi.
- [ ] Ekrandagi haqiqiy narx faqat qayd ekanini, bu sinovda hech qanday to‘lov olinmasligini tasdiqlaydi.
- [ ] Mashina amalda mijozga topshirilgandan keyin receptionist Completed qiladi.

### 5. Uchrashuvdan buyurtma ochish

- [ ] Bekor qilinmagan va yakunlanmagan demo appointment tanlanadi.
- [ ] Appointment amallaridan Create work order tanlanadi.
- [ ] Ochilgan buyurtmada appointment, mijoz va avtomobil bog‘langanini tekshiradi.
- [ ] Shu appointment’dan amal takror bajarilganda ikkinchi buyurtma ochilmasligini tekshiradi.

### 6. Telefon ekranida ishlatish

- [ ] 375 px kenglikdagi telefonda qabul va buyurtma tafsilotini tekshiradi.
- [ ] Imkon bo‘lsa 320 px kenglikda ham qayta tekshiradi.
- [ ] Gorizontal scroll yo‘q; qidiruv, select va asosiy tugmalar ko‘rinadi va bosish oson.

## Yakuniy natija

**Pilot o‘tdi**, agar qabulxona navbatsiz mashinani appointment uydirmasdan qabul qila olsa, mexanik o‘z ishini xavfsiz yuritsa, tayyorlash bitta xizmat tarixini yozsa, topshirish alohida yopilsa va telefon ekranida asosiy boshqaruvlar ishlasa.

Xato bo‘lsa, production/deployga o‘tmang. Quyidagilarni yozib qo‘ying: sana, brauzer/qurilma, rol, sun’iy buyurtma ID’si, bajarilgan qadam, kutilgan natija va ko‘rilgan natija. Screenshot kerak bo‘lsa, unda haqiqiy mijoz ma’lumoti, token yoki parol bo‘lmasin.
