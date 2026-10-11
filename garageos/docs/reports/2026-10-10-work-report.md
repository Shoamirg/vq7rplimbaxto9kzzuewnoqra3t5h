# GarageOS — bajarilgan ishlar hisoboti
Hisobot sanasi: 10.10.2026, 21:26 | Toshkent vaqti

Ushbu hisobot GarageOS bo‘yicha shu paytgacha bajarilgan, Git tarixida yoki tekshiruv dalillarida qayd etilgan ishlarni jamlaydi. Asosiy davr: 28.09.2026–10.10.2026. Oldindan mavjud kod butunlay yangidan yozilgan deb ko‘rsatilmaydi.

## Joriy natija

Avtoservisning asosiy qabul → mijoz/avtomobil → navbat → usta → servis ishini boshlash/tugatish → hisob-faktura → qo‘lda to‘lov jarayoni amalga oshirilgan. Flutter ilovasi, brauzer panellari, API, xavfsizlik va tekshiruv infratuzilmasi bo‘yicha keng ish bajarilgan. Loyiha hali 100% yakunlanmagan va mijozga to‘liq topshirilgani tasdiqlanmagan.

Ko‘rsatkich | Tasdiqlangan holat
--- | ---
Repozitoriy | Shoamirg/garageos
Ish branchi | codex/service-work-demo
Pull request | PR #5 ochiq; main bilan birlashtirilmagan
Oxirgi push qilingan kod | 96a4383de35c — 09.10.2026
Commitlar | 28.09.2026 dan boshlab joriy HEAD tarixida 68 ta commit
Oxirgi arxivlangan CI | Jenkins #416 — SUCCESS; 1785 ta artifact
Yangi lokal o‘zgarishlar | Alohida nomzod kod; hali GitHub’ga push qilinmagan

## Hisobotni qanday o‘qish kerak

“Yozilgan/push qilingan” — kod branchda mavjud. “Tekshirilgan” — ko‘rsatilgan sinov yoki CI haqiqatan bajarilgan. “Tayyorlangan” — reja yoki tuzatish nusxasi bor, lekin qabul sinovi hali yo‘q. Bir bosqichning muvaffaqiyati butun loyiha tayyorligini anglatmaydi.

Hisobotda parollar, tokenlar, imzolash kalitlari va mijozning maxfiy ma’lumotlari kiritilmagan. Hisobot tayyorlash paytida yangi to‘liq regressiya ishga tushirilmadi; mavjud natijalar va ularning log hash’lari tekshirildi.

# 1. Kundalik servis va mobil ilova
Asosiy mahsulot funksiyalari

## Qabul, mijoz va avtomobil

Yangi mijoz va avtomobilni qabul vaqtida yaratish, mavjudlarini serverda qidirish va sahifalash, davlat raqami/VIN hamda telefon identifikatorlari bo‘yicha dublikatlarni nazorat qilish yaxshilandi. Boshqa avtoservis ma’lumoti tanlovga aralashmasligi tekshirildi.

## Navbatdan bajarilgan ishgacha

Haqiqiy usta akkauntini tanlash, navbatni tasdiqlash, ishni boshlash va tugatish joriy qilindi. Ustasiz ishni boshlash, noto‘g‘ri holatga o‘tish va band vaqtga to‘qnashish rad etiladi. Tugagan ish servis tarixiga bog‘lanadi.

## Hisob va to‘lov

Tugagan navbatga bitta final UZS hisob-faktura, xizmat/qism qatorlari, qisman yoki to‘liq qo‘lda to‘lov qaydi va qolgan qarz mavjud. Takroriy urinish bir xil hisob yoki to‘lovni ko‘paytirib yubormasligi himoyalandi.

## Kunlik tez ko‘rinishlar

Barcha sanalardan davom etayotgan ishlarni va tugagan, lekin final hisob kutilayotgan ishlarni ko‘rsatish qo‘shildi. Bu belgilar real server holati va hisob bog‘lanishidan olinadi.

## Flutter ilovasi

Android/iOS uchun mavjud Flutter staff oqimi rivojlantirildi; offline demo va real API rejimi ajratildi. Mijoz va usta rollari uchun alohida ko‘rish oqimlari, login, tarix, navbat, hisob va tegishli to‘lov yozuvlari qo‘shildi.

## Dizayn va uch til

Foydalanuvchi tasdiqlagan oq/to‘q sariq dizayn, light/dark, UZ/EN/RU, telefon/tablet ko‘rinishi va saqlanadigan til tanlovi joriy qilindi. Til o‘zgarishi forma/draft yoki sessiyani asossiz yo‘qotmasligi tekshirildi.

100 ta HTML dizayn namunasini saqlash 100 ta mobil ekran tayyor degani emas. Bu hisobotda faqat haqiqatan amalga oshirilgan oqimlar tayyor deb ko‘rsatiladi.

Manbalar: #1, #2, #3, #4, #6, #7, #9, #14, #15, #16, #17. GitHub havolalari vazifalar reyestrida berilgan.

# 2. Akkauntlar, xavfsizlik va kalendar
Ma’lumot doirasi va ishonchli yozuvlar

Rol | Amaldagi doira
--- | ---
Mijoz | O‘z akkaunti, avtomobillari va ruxsatli tarix; password portal read-only.
Usta | O‘z akkauntiga tayinlangan servis ishlarini ko‘rish, boshlash/tugatish.
Servis egasi/xodim | O‘z avtoservisi doirasida qabul, navbat, xodimlar va biznes yozuvlari.
Superadmin | Alohida platform GET ko‘rishi; active super_admin roli va platform flag talab etiladi.

## Akkaunt va tenant himoyasi

- Login, access va refresh tokenlarda faol akkaunt, avtoservis va rol qayta tekshiriladi; suspend qilingan kirish va eski credential versiyasi rad etiladi.

- Egasi xodim akkauntlarini hamda mavjud mijozga alohida email/parol kirishini yaratishi va to‘xtatishi mumkin. Mijoz tokeni staff huquqini bermaydi.

- Real avtoservis va xodimlarni demo tranzaksiyalarsiz sozlash komandasi, alohida ishonchli platform akkauntini tayyorlash komandasi yozildi. Real mijoz muhitiga qo‘llash hali alohida ish.

- Operational case va conversation bog‘lanishlarida customer/vehicle/assigned user tenant chegaralari tekshirildi. Oddiy foreign key mavjudligi yetarli himoya deb qabul qilinmadi.

## Tranzaksiyalar va baza

Yozuvchi API’larda muvaffaqiyatli HTTP javobidan oldin commit bajarilishi tuzatildi. Commit xatosida noto‘g‘ri “saqlandi” javobi berilmasligi, rollback va event tartibi tekshirildi. Alembic/model mosligi, yangi baza migratsiyasi, aktiv mijoz telefoni va avtomobil identifikatorlari cheklovlari mustahkamlandi.

## Kalendar va navbat

Day/Week/Month haqiqiy davr ma’lumotlari bilan ishlashi, usta akkauntining UUID tayinlovi ko‘chirishda saqlanishi, bir xil ismli ustalarni ajratish va tugagan/bekor qilingan navbat detali tuzatildi. Telefon navbati kartalari, filtr/sahifalash, tanlangan yozuvlar, xato/retry va UZ/EN/RU matnlari yaxshilandi.

Manbalar: #11, #12, #13, #18, #27, #32, #33, #34, #35. GitHub havolalari vazifalar reyestrida berilgan.

# 3. Operations va Inbox
Suhbatlar va operatsion ishlar

## Operations — push qilingan va tekshirilgan

Case ro‘yxati uchun to‘liq server sahifalashi, literal ko‘p tilli qidiruv va filtrlangan hisoblar joriy qilindi. Eski yozuvlar dastlabki 60 ta natija bilan cheklanmaydi. Haqiqiy case detali, usta/status amallari, phone/desktop, UZ/EN/RU, loading/error/retry va captured-target himoyalari yakunlandi. #37 uchun Jenkins #237 muvaffaqiyatli dalili bor.

## Xabar yuborishning ishonchliligi — #38

Operations, Inbox va Mini bir xil conversation agregatidan foydalanishi saqlandi. Yo‘qolgan javobdan keyin xabarni takror yuborib ko‘paytirishdan himoyalovchi durable intent/idempotency oqimi yozildi. A→B→A navigatsiyada draft, qabul qiluvchi va frozen payload saqlanadi; logout yoki boshqa shaxsga o‘tishda eski himoyalangan ma’lumotlar tozalanadi.

ACK olingani va keyingi refresh xatosi ajratiladi; noma’lum natijada avtomatik qayta yuborish o‘rniga ongli tekshirish/qayta urinish ishlaydi. #38 exact-SHA Jenkins #320: backend 602, Flutter 92 va brauzer 365 test muvaffaqiyatli bo‘lgan.

## General Inbox — bir qismi push qilingan

- Xavfsiz to‘liq queue paging/search, view/count ma’nolari va eski suhbatlarga kirish.

- Status, assignment, follow/unfollow va server-observed mark-read: yangi xabar eski ACK bilan yo‘qolmasligi, takroriy amallarga va boshqa tanlangan suhbatga kech javobga qarshi himoya.

- Brauzerda ma’lumot o‘qish, sessiya/huquq tekshiruvi, draft va mutation pending/ACK/error holatlari saqlanishi.

## General Inbox — yangi lokal ishlar

Conversation yaratish, haqiqiy customer/vehicle/case/appointment/invoice/assignee tanlash, katta ro‘yxatlarda qidiruv/sahifalash va reference projection bo‘yicha yangi kod/testlar tayyorlandi. Oldingi shu doiradagi 68 ta brauzer testi o‘tgan, 82 ta accessibility hisoboti nol buzilish ko‘rsatgan. Ushbu yangi nomzod kod hali push qilinmagan; to‘liq #39 qabuliga teng emas.

Hali qolgan: to‘g‘ri owning linked-record kirishi, haqqoniy context/stored summary, barcha 8 tezkor amal, ruxsatli export va qolgan lokalizatsiya. Soxta health/certification/AI/ETA ma’lumoti tayyor funksiya sifatida ko‘rsatilmasligi kerak.

Manbalar: #36, #37, #38, #39. GitHub havolalari vazifalar reyestrida berilgan.

# 4. Billing va yangi lokal tuzatishlar
Moliyaviy holat, hujjat va telefon interfeysi

## Branchdagi moliyaviy ishlar

- Hisob yuborish issued/partial/paid holatlari va qarzni asossiz o‘zgartirmaydi. To‘lov musbat, chekli va qoldiq doirasida tekshiriladi; noaniq retry’da idempotency saqlanadi.

- UZS va oldingi USD yozuvlari aralashtirilmaydi. Bitta tugagan appointment uchun bitta final invoice va xodim kiritgan qator/summalar saqlanadi.

- Flutter/API hisoblar tarixi barcha faol hisoblar orasida server qidiruvi, sahifalar va haqiqiy total bilan ishlaydi. N+1 query kuchayishi kamaytirildi va vakillik qiladigan bazada tekshirildi.

- Invoice/estimate’da demo servis konstantasi o‘rniga hujjatning haqiqiy egasi bo‘lgan avtoservis nomi va kontaktlari chiqariladi. Public invoice/print/PDF oqimlari mavjud.

## Push qilinmagan lokal Billing yaxshilanishlari

Muammo | Bajarilgan tuzatish
--- | ---
Katta hisob tarixi | Server qidiruvi/page bounds, matched total, oldingi/keyingi sahifa va bo‘sh natija.
Eski hisobga to‘g‘ri kirish | Invoice UUID mustaqil detail read bilan olinadi; uppercase UUID normalizatsiyasi.
O‘qish xatosida to‘lov | Joriy document loading/error bo‘lsa write tugmasi bloklanadi; actor/selection qayta tekshiriladi.
Noto‘g‘ri “Saved” xabari | Bekor qilingan yoki actor mos kelmagan payment false success sifatida chiqmaydi.
Telefon va dark/light | Nol balandlikdagi ro‘yxat, kontrast, scroll va fokuslangan KPI klaviatura navigatsiyasi tuzatildi.

Natija: Billing va hujjat egasiga tegishli 35 ta brauzer testi muvaffaqiyatli: 18 locale × width × theme holati, 11 Billing xulq-atvor testi va 6 issuer testi. Qo‘shimcha 3 ta native keyboard holati ham o‘tgan. Bu tor doiradagi natijalar umumiy regressiya o‘rnini bosmaydi.

Qo‘lda to‘lov qaydi bankdan pul yechish integratsiyasi emas. Yangi Billing tuzatishlari to‘liq regressiya va push/CI bosqichini kutmoqda.

Manbalar: #3, #6, #14, #25, #31, #39. GitHub havolalari vazifalar reyestrida berilgan.

# 5. Jenkins, Android va infratuzilma
Build, release tayyorgarligi va tiklash

## Lokal Jenkins

GitHub Actions billing/limit muammosi fonida ushbu Windows kompyuterida Jenkins pipeline yo‘lga qo‘yildi. Alohida checkout, test bazasi, backend/Flutter/brauzer/Android tekshiruvlari, build, audit, Docker transport, recovery va artifact arxivi bir oqimga birlashtirildi. Windows/WSL yo‘llari, jarayonni qayta tiklash va sinov resurslariga egalik bo‘yicha tuzatishlar qilindi.

Oxirgi arxivlangan aniq kod: 96a4383de35c, Jenkins #416 SUCCESS. Bu keyingi lokal nomzod kodni hali tekshirgan degani emas. Sheriklarning masofadan Jenkins kirishi ustida ish olib borilgan; hozirgi tunnel URL, login va tashqi kirish ishlashi ushbu hisobot tayyorlashda qayta tasdiqlanmadi.

## Android va iOS

- Android release’da debug signing fallback olib tashlandi. Tashqi/private keystore va aniq HTTPS /api/v1 talab qilinadi; noaniq yoki noto‘g‘ri config uchun tushunarli rad javobi bor.

- Alohida QA kaliti bilan split release APK’lar qurildi. Izolyatsiyalangan Android emulator runtime, native saqlash va asosiy oqim tekshiruvlari bajarilgan; CI’da 34 Android gate dalili mavjud.

- QA kaliti bilan olingan APK mijozning rasmiy imzolangan release’i sifatida ko‘rsatilmaydi. Haqiqiy Android telefon va owner signing qabuli alohida qolgan.

- iOS unsigned build/simulator workflow va TestFlight yo‘riqnomasi tayyorlangan. Joriy kod uchun signed IPA, haqiqiy iPhone yoki TestFlight topshirish dalili hali yo‘q.

## Production tayyorgarligi va backup

Caddy/Docker API va panel yo‘nalishlari, production port/config va HTTPS transport talablari tekshirildi. PostgreSQL 16 bilan haqiqiy backup → yangi bazaga restore mashqi, schema/credential/moliyaviy yozuvlar va resurs collision himoyasi yozildi; 4 recovery testi o‘tgan. Mijozning o‘z serveri, tashqi backup manzili va ish jadvali hali alohida qabulni talab qiladi.

## Dependency xavfsizligi

Dashboard build zanjiri va backend runtime’dagi ma’lum advisory’lar bo‘yicha paketlar yangilandi; audit natijalarini yashirish orqali “green” qilinmadi. Saqlangan oxirgi CI’da to‘liq fresh audit muvaffaqiyatli. Bu 10.10.2026 dan keyingi barcha yangi advisory’lar yo‘qligiga kafolat emas.

Manbalar: #8, #19, #20, #21, #22, #23, #24. GitHub havolalari vazifalar reyestrida berilgan.

# 6. Haqiqatan bajarilgan tekshiruvlar
Bir-biridan alohida kod va sinov doiralari

## Push qilingan kod — Jenkins #416

Tekshiruv | Saqlangan natija
--- | ---
Aniq commit | 96a4383de35c
Backend | 763 test
Flutter real API | 92 test
Production brauzer | 406 test / 33 fayl
Whole-page axe | 384 hisobot / 0 violation
Skrinshotlar | 490 PNG; hammasi qo‘lda ko‘rilgan degan da’vo yo‘q
Android | 34 gate / 3 ta QA-only split APK
PostgreSQL recovery | 4 test
Invoice volume | 1 sinov
Arxiv | 1785 artifact; 919 source faylning tekshirilgan nusxasi

## Yangi lokal nomzod kod

Tekshiruv | Natija va chegarasi
--- | ---
To‘liq backend | 913 passed; 0 failure/error/skip. Backend manba doirasi avvalgi log bilan mos.
Billing + issuer | 35 passed; 0 failed/skipped/not-run; 155.97 soniya.
KPI klaviatura | 3 passed; 0 failed; faqat qayd etilgan 3 holat.
503 testli integratsiya | 486-ordinaldan so‘ng uzilgan: 473 alohida PASS, 13 FAIL, 17 natijasiz. Yakuniy exit/count yo‘q.
Route diagnostikasi | 1 test qayta bajarilgan: 0 passed / 1 failed. “Route is already handled!” yana kuzatilgan.

12 kuzatilgan failure kerakli suhbat birinchi queue sahifasida bo‘lishini taxmin qilgan oddiy row navigation’da timeout bergan. Qidiruv orqali aniq UUID/subject’ga kirish tuzatish nusxalari tayyorlangan, hali qayta qabul qilinmagan. Route muammosi uchun original assertion’larni saqlagan scalar diagnostika va yangi tuzatish taklifi tayyorlangan.

473/503 ni “94% loyiha tayyor” deb talqin qilish mumkin emas. Test sonlari turli code snapshot va doiralarga tegishli; ular qo‘shib yuborilmadi. To‘liq regressiya hali muvaffaqiyatli yakunlanmagan.

# 7. Yakunlash uchun qolgan ishlar
#10 dagi 7 qabul mezoni va #39 dagi to‘liq doira

Qabul mezoni | Hozirgi baho
--- | ---
1. Barcha eski/yangi yozuv va asosiy tugmalar | Qisman bajarilgan. Inbox context, 8 action, export va ayrim platform/localization ishlari qolgan.
2. Mijoz HTTPS muhiti va real akkauntlar | Kod va operator vositalari bor; haqiqiy mijoz serverida qabul dalili yo‘q.
3. Hajm, tezlik va release regressiyasi | Ko‘p mahalliy/CI dalili bor; yangi 503 integratsiya uzilgan, mijoz muhitidagi qabul qolgan.
4. Imzolangan Android/iOS va real telefon | QA Android/emulator bor; owner release signing, real telefon/iPhone/TestFlight qabuli qolgan.
5. Mijoz bazasida backup va rollback | Izolyatsiyalangan real PG mashqi bor; mijoz serveri/off-host backup/update-rollback dalili qolgan.
6. Haqiqiy avtoservis piloti | Haqiqiy ish kuni, rol/doira tasdig‘i va yozilgan mijoz qabul natijasi yo‘q.
7. Yo‘riqnoma va topshirish | User/operator hujjatlari tayyor; mijozga amaliy topshirish va qabul qaydi qolgan.

## Keyingi texnik ketma-ketlik

- Kuzatilgan integration failure’larini asl assertion’larni kuchsizlantirmasdan tuzatish; owning testlar va yangi to‘liq brauzer regressiyasini tugatish.

- Tekshirilgan lokal incrementni shu branch/PR #5 ga push qilish; aynan yangi SHA uchun CI va artifact dalilini olish.

- Appointment owning read/entry, haqiqiy context va bog‘langan customer/vehicle/case/invoice destination’larini yakunlash. Keyingi to‘rtta slice spetsifikatsiyasi tayyor va mustaqil ko‘rib chiqilgan; implementatsiya deyilmaydi.

- 8 amal: telefon qilish, booking, estimate, emergency case, passport share, photo request, location request va ETA. Mavjud real imkoniyat ishlaydi; yetishmayotgan shart/tashqi imkoniyat aniq ko‘rsatiladi.

- Ruxsatli UTF-8 JSON export, qolgan til/accessibility tekshiruvlari va #18 global platform talablarini saqlash.

Keyingi release/deployment va pilot uchun haqiqiy server, domain, servis identifikatorlari, signing egalari, qurilmalar va mijoz qabuli kerak. Tayyorlik foizi hisoblansa ham u bu yetti mezonning tekshirilgan daliliga asoslanishi kerak; hozir 100% deb aytishga asos yo‘q.

# 8. Barcha vazifalar reyestri — I
GitHub Issues: Shoamirg/garageos

Holat kod/tekshiruv daliliga tegishli. GitHub’da bu vazifalar ochiq turibdi: branchdagi incrementlar PR merge yoki yakuniy delivery qabulini kutadi. #5 issue emas, pull request. Bir vazifaning to‘liq original doirasi uning havolasida saqlangan.

Vazifa | Bajarilgan ish / mavzu | Holat
--- | --- | ---
#1 | O‘zbekcha servis→hisob demo spetsifikatsiyasi | Oqim yozilgan
#2 | Servis ishini boshlash/tugatish | Push qilingan
#3 | Bitta linked UZS final hisob | Push qilingan
#4 | Public invoice va demo journey | Push qilingan
#6 | Kundalik qabul/billing/mobile tuzatishlar | Push qilingan
#7 | Flutter staff oqimi | Push qilingan
#8 | iOS build/TestFlight tayyorgarligi | Release qabuli qolgan
#9 | Tasdiqlangan dizayn va UZ/EN/RU | Push qilingan
#10 | Birinchi haqiqiy mijozga topshirish | Yakunlanmagan
#11 | Baza identifikatorlari/migratsiya/backup | Push qilingan
#12 | Staff access lifecycle | Push qilingan
#13 | Demo yozuvsiz real servis provisioning | Vosita yozilgan
#14 | Flutter/API to‘liq hisoblar tarixi | Push qilingan
#15 | Haqiqiy usta akkauntini tanlash | Push qilingan
#16 | Barcha sanalardan davom etayotgan ishlar | Push qilingan
#17 | Final hisob kutilayotgan ishlar | Push qilingan
#18 | Mijoz/usta/admin/superadmin panellari | Qisman; scope qolgan
#19 | Lokal Windows Jenkins CI | Sozlangan

Har bir raqam PDF’da tegishli GitHub vazifasiga bog‘langan. Tarixiy issue body’da eski CI blocker yozuvi qolishi mumkin; joriy umumiy holat uchun #10/#39 ning eng yuqori checkpoint’i va ushbu hisobotning aniq SHA doirasi olinadi.

# 9. Barcha vazifalar reyestri — II
GitHub Issues: Shoamirg/garageos

Holat kod/tekshiruv daliliga tegishli. GitHub’da bu vazifalar ochiq turibdi: branchdagi incrementlar PR merge yoki yakuniy delivery qabulini kutadi. #5 issue emas, pull request. Bir vazifaning to‘liq original doirasi uning havolasida saqlangan.

Vazifa | Bajarilgan ish / mavzu | Holat
--- | --- | ---
#20 | Dashboard dependency advisories | Tuzatish push qilingan
#21 | Backend dependency advisories | Tuzatish push qilingan
#22 | Android release signing/packaging | QA tekshirilgan
#23 | Alohida Android emulator runtime | QA tekshirilgan
#24 | Haqiqiy PostgreSQL recovery | Tekshirilgan
#25 | Invoice query budget va data volume | Tekshirilgan
#26 | User/operator topshirish yo‘riqnomalari | Tayyorlangan
#27 | Ishonchli platform enrollment | Vosita yozilgan
#28 | To‘liq browser release CI gate | Push qilingan
#29 | Accessibility spot-check tuzatishlari | Tekshirilgan doira
#30 | Staff notification/error/loading tillari | Push qilingan
#31 | Hujjatda haqiqiy servis egasi | Push qilingan
#32 | Day/Week/Month va mechanic UUID | Push qilingan
#33 | Phone navbat va to‘liq lokalizatsiya | Push qilingan
#34 | HTTP success’dan oldin commit | Push qilingan
#35 | Case tenant/reference himoyasi | Push qilingan
#36 | Case server paging/search/counts | Push qilingan
#37 | To‘liq real Operations oqimlari | CI tekshirilgan
#38 | Durable shared message submissions | CI tekshirilgan
#39 | General Inbox to‘liq workflow | Davom etmoqda

Har bir raqam PDF’da tegishli GitHub vazifasiga bog‘langan. Tarixiy issue body’da eski CI blocker yozuvi qolishi mumkin; joriy umumiy holat uchun #10/#39 ning eng yuqori checkpoint’i va ushbu hisobotning aniq SHA doirasi olinadi.

# 10. Hujjatlar, arxitektura va vaqt chizig‘i
Tayyorlangan materiallar va manbalar

## Tayyor hujjatlar

Hujjat | Mazmuni
--- | ---
USER-GUIDE.md | Login, qabul, navbat, usta, hisob, to‘lov va kundalik foydalanish.
HANDOFF.md / DEPLOYMENT.md | Topshirish, muhit, backup, yangilash va operator qabul dalillari.
PROVISIONING.md / STAFF-ACCOUNTS.md | Real servis va xodim akkauntlarini xavfsiz sozlash.
PLATFORM-ACCOUNTS.md / MECHANIC-WORKFLOW.md | Platform enrollment, rollar va usta jarayoni.
PERFORMANCE.md va workflow hujjatlari | Volume/query, calendar, queue, Operations, transaksiya va accessibility.
architecture/overview.md va ADRlar | Amaldagi tuzilma, tenant, event, durable message va observed-read qarorlari.
GarageOS-Arxitektura.pdf | 09.10.2026 dagi kod asosidagi 4 sahifali alohida arxitektura fayli.

## Arxitektura qisqacha

Flutter mobil ilovasi va Next.js/React brauzer panellari FastAPI /api/v1 bilan ishlaydi. PostgreSQL biznes yozuvlarini, Redis booking/rate-limit kalitlarini saqlaydi. Brauzer staff so‘rovlari Next.js BFF orqali, native mobil so‘rovlar HTTPS API orqali o‘tadi. Caddy production kirishi va Docker Compose xizmatlarini birlashtiradi. Eventlar commitdan keyin bajariladi; kafolatlangan persistent tashqi notification outbox’i tayyor deb ko‘rsatilmaydi.

## Ishlar ketma-ketligi

28.09: servis→invoice demo va migratsiya tuzatishlari. 02–04.10: kundalik qabul/billing, Flutter, dizayn/uch til, baza/access/provisioning va hisoblar tarixi. 06.10: rol va akkauntlar, customer portal, platform paneli. 07.10: usta/ongoing/awaiting invoice va lokal Jenkins. 08.10: dependency xavfsizligi, Android, recovery, docs, kalendar/navbat va Operations. 09.10: durable messages, Inbox guards va Jenkins416. 10.10: lokal creation/Billing tekshiruvlari, uzilgan umumiy regressiya, diagnostika va ushbu hisobot.

## Asosiy havolalar

Repozitoriy: https://github.com/Shoamirg/garageos | PR: https://github.com/Shoamirg/garageos/pull/5 | Delivery: https://github.com/Shoamirg/garageos/issues/10 | Joriy Inbox: https://github.com/Shoamirg/garageos/issues/39

Hisobot holatning sana bilan qayd etilgan nusxasi. Keyingi push va sinov natijalari tracker’da yangilanadi. Nomi GarageOS saqlangan; yangi mahsulot yoki boshqa repository qurilgan deb ko‘rsatilmaydi.
