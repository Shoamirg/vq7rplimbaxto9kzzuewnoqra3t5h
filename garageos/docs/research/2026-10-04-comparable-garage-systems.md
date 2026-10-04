# GarageOS: o‘xshash tizimlardan o‘rganilgan dizayn va arxitektura

**Sana:** 2026-10-04. **Tekshirilgan GarageOS:** `91a39797bfaf3d6e2217713eb14194dade82fd99`, `codex/service-work-demo`.

Bu hujjat faktlar va muhokama uchun takliflarni saqlaydi. Yangi funksiya, arxitektura yoki dizayn qarori qabul qilingan emas. Joriy mijozga topshirish doirasi va qolgan ishlar [issue #10](https://github.com/Shoamirg/garageos/issues/10) da yuritiladi.

## 1. Qanday o‘rganildi?

- Uch tijoriy mahsulotning rasmiy qo‘llanmalari va ochiq ekranlari o‘rganildi: Shopmonkey, Tekmetric, Shop-Ware. Quyida berilgan ekranlar haqiqiy brauzerda ko‘rildi. Akkaunt yoki trial ochilmadi.
- Uch ochiq loyihada README bilan birga biznes kodi o‘qildi: ARK Core, CarCare, OpenAutoCore. Uchinchi tomon dasturlari ishga tushirilmadi.
- GarageOS kodi bilan taqqoslandi. Backend imkoniyati bilan Flutter’da mavjud ekran farqlanadi.
- **Kuzatuv** — manbada ko‘rilgan holat; **taklif** — GarageOS uchun chiqarilgan, foydalanuvchi bilan kelishiladigan xulosa. Tijoriy mahsulot ekranidan uning yopiq backend texnologiyasi yoki ishonchliligi aniqlanmaydi.

## 2. Qaysi tizimdan nimani o‘rgandik?

| Tizim | Manbada kuzatilgan | GarageOS uchun taklif |
| --- | --- | --- |
| [Shopmonkey Workflow](https://support.shopmonkey.io/hc/en-us/articles/38743858598676-Workflow-Views) | Ishlarni holat ustunlari yoki ro‘yxatda ko‘rish; kartalar zichligini va saralashni sozlash | Keng ekranda ishlar doskasi; telefonda holat bo‘yicha tablar va ro‘yxat. |
| [Tekmetric Mobile](https://support.tekmetric.com/hc/en-us/articles/26781766611351-Tekmetric-Mobile), [My Work](https://support.tekmetric.com/hc/en-us/articles/33632999773975-My-Work-on-the-Tekmetric-Mobile-App) | Mobil holat tablari, usta/label filtri, ustaga tayinlangan ishlar; ish ichida tashvishlar va inspection | Usta o‘zi ilovada ishlashi kerak bo‘lsa, unga shaxsiy ishlar navbati va kerakli amalni ko‘rsatish. |
| [Shop-Ware DVX](https://shop-ware.com/features/dvx/) | Ko‘rik topilmalari, tavsiyalar, narx va mijoz tasdig‘ini bog‘lagan jarayon | Foto dalil → tushunarli tavsiya → kelishilgan ish oqimi. Birinchi mijozga zarurligi hali aniqlanmagan. |
| [ARK Core](https://github.com/EdwardSoaresJr/ark-core) | Navbat bilan servis buyurtmasi chegarasi, versiya tekshiruvi, tasdiq izi, hisob snapshoti | Ish uzoq davom etsa yoki bir nechta xodim tahrirlasa, shu chegaralarni bizda tekshirish. |
| [CarCare](https://github.com/rene98c/carcareco) | `Work` ichida takliflar va bajariladigan ishlar; taklif qayta chiqarilganda yangi nusxa | Eski narx kelishuvi yo‘qolmaydigan taklif tarixi. |
| [OpenAutoCore schema](https://github.com/winterautollc/OpenAutoCore/blob/2ec59b3c7568b0c70bca03af3b6adfa7eb69906c/openauto_schema.sql), [DB connection](https://github.com/winterautollc/OpenAutoCore/blob/2ec59b3c7568b0c70bca03af3b6adfa7eb69906c/openauto/repositories/db_handlers.py) | Navbatsiz servis buyurtmasi; ish/qator bo‘yicha tasdiq; desktopdan MySQLga ulanish | Navbatsiz kelish va xizmatlarning faqat bir qismini qabul qilish ehtiyojini mijozda tekshirish. |

Bu ro‘yxat mahsulotlar mustaqil ravishda sinovdan o‘tganini yoki mijozga tayyorligini anglatmaydi.

## 3. Ko‘rish uchun haqiqiy ekranlar

### Shopmonkey — keng ekran uchun ishlar doskasi

Ko‘rilgan rasmda Estimates, Dropped Off, In Progress va Invoices ustunlari bor; kartalarda mashina va mijoz konteksti saqlanadi. Bizga foydali g‘oya — ish holatini bir qarashda bilish. Ustunlar sonini telefonga aynan ko‘chirish tavsiya qilinmaydi. [Rasm va qo‘llanma manbasi](https://support.shopmonkey.io/hc/en-us/articles/38743858598676-Workflow-Views).

![Shopmonkey rasmiy workflow doskasi](https://support.shopmonkey.io/hc/article_attachments/38741521260308)

### Tekmetric — telefon uchun holat tablari

Ko‘rilgan rasmda Estimates / Work in Progress / Completed tablari va sonlari, qidiruv/filtrlar, mashina-mijoz kartalari, ish holati va RO raqami ko‘rinadi. Bizga foydali g‘oya — telefonda bitta holatning o‘qilishi oson ro‘yxati. [Mobil qo‘llanma](https://support.tekmetric.com/hc/en-us/articles/26781766611351-Tekmetric-Mobile).

![Tekmetric rasmiy mobil ishlar ro‘yxati](https://support.tekmetric.com/hc/article_attachments/26781760187671)

Qo‘shimcha ko‘rilgan namunalar: [Shopmonkey inspection](https://support.shopmonkey.io/hc/article_attachments/38741048482324), [mijozning xizmatlarni tasdiqlashi](https://support.shopmonkey.io/hc/article_attachments/41762075743380), [Tekmetric My Work](https://support.tekmetric.com/hc/article_attachments/33640371063447), [Shop-Ware mobil kollaji](https://shop-ware.com/wp-content/uploads/Shop-Ware-4-screen-Tech-App.jpg), [CarCare ish tafsiloti](https://github.com/rene98c/carcareco/raw/17cdd00c9877dbc0a6492ddf6dc09c8605319a79/docs/screenshots/workdisplay.png).

Bular boshqa tizimlarning rasmiy namunalari, GarageOS maketlari emas. Rasmlar dp o‘lchami, accessibility, tezlik yoki real qurilmadagi qulaylik sinovini almashtirmaydi.

## 4. Arxitekturadagi foydali tushunchalar — sodda qilib

### A. Navbat va servis buyurtmasi

**Sodda misol:** “Dushanba 10:00 da keling” — navbat. “Tormozni tekshirish va almashtirish” — bajariladigan ish. Mashina ikki kun qolishi yoki ehtiyot qism kutishi mumkin; uchrashuv vaqtini o‘zgartirish bajarilgan ishni yo‘qotmasligi kerak.

**Kuzatuv:** ARK’dagi scheduling action mavjud RepairOrder’ga navbat qo‘shadi/ko‘chiradi va ish holatini saqlashni tekshiradi. CarCare’da Work taklif va repair joblarni birlashtiradi. [ARK scheduling kodi](https://github.com/EdwardSoaresJr/ark-core/blob/4234aca9a503b4fc209b4eb592564078e55cb730/app/Ark/Operations/Appointments/ScheduleRepairOrderAppointment.php), [CarCare Work](https://github.com/rene98c/carcareco/blob/17cdd00c9877dbc0a6492ddf6dc09c8605319a79/backend/src/Carmasters.Domain/Work/Work.cs).

**GarageOS:** Appointment hozir tashrif va ish holatini birlashtiradi; ServiceRecord tugagan ish tarixidir. **Taklif:** alohida servis buyurtmasini qo‘shishdan avval navbatsiz kelish, ko‘p kunlik ish va qism kutish mijozning haqiqiy jarayoniga kirishini aniqlash. [Joriy Appointment modeli](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/models/appointment.py#L19), [tugatish jarayoni](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/services/appointment_service.py#L293).

### B. Ikki xodimning tahriri to‘qnashmasin

**Sodda misol:** biri narxni 500 mingga o‘zgartirdi. Ikkinchisi eski ekranidagi 400 mingni saqlab, yangisini bilmasdan bosib ketmasin.

**Kuzatuv:** ARK row lock va ochilgan estimate versiyasini birga tekshiradi. **Taklif:** GarageOS’da parallel hujjat tahriri uchun eski versiyani rad etish ehtiyojini alohida sinash. Bizdagi to‘lov lock/idempotency bu boshqa masalani avtomatik hal qilmaydi. [ARK concurrency](https://github.com/EdwardSoaresJr/ark-core/blob/4234aca9a503b4fc209b4eb592564078e55cb730/app/Ark/Operations/RepairOrders/RepairOrderConcurrency.php), [GarageOS hujjat update’i](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/services/invoice_service.py#L206).

### C. Mijoz aynan qaysi narxni tasdiqladi?

**Sodda misol:** mijoz 500 minglik ishni ma’qulladi. Keyin ish qo‘shilsa, eski rozilik 700 mingga berilgan deb ko‘rinmasin.

**Kuzatuv:** ARK tasdiqning manbasi/vaqti va estimate snapshot havolasini saqlaydi; CarCare qayta chiqarilgan taklifning yangi nusxasini yaratadi. [ARK approval action](https://github.com/EdwardSoaresJr/ark-core/blob/4234aca9a503b4fc209b4eb592564078e55cb730/app/Ark/Operations/Approvals/RecordCustomerAuthorizationAction.php), [CarCare Offer](https://github.com/rene98c/carcareco/blob/17cdd00c9877dbc0a6492ddf6dc09c8605319a79/backend/src/Carmasters.Domain/Work/Offer.cs).

**GarageOS:** backend/customer Mini App’da approve/decline/question bor; Flutter staff doirasi torroq. Versiyalangan tasdiqlangan mazmun va imzo tarixi aniqlanmadi. **Taklif:** bu imkoniyatni yangi tasdiqlash tizimini qayta qurishdan oldin mavjud estimate API asosida loyihalash; birinchi topshirishga qo‘shish user qarori. [Customer billing API](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/api/v1/endpoints/customer/billing.py#L41).

### D. Eski hisob tarixiy nusxa bo‘lib qolsin

**Sodda misol:** mijoz keyin telefon raqamini yoki ism yozilishini tuzatdi. Oldin berilgan hisobni qayta chiqarishda o‘sha kundagi hujjat mazmuni saqlansin.

**Kuzatuv:** ARK final hisob snapshotida mijoz, mashina va totallarni saqlaydi; hujjat va PDF yaratish xatosini ajratadi. **Taklif:** bizda tarixiy hujjat nusxasi, qayta chiqarish va tuzatish siyosatini tekshirish. GarageOS’dagi bitta final hisob, partial payment/refund va replay-safe to‘lovni saqlash kerak; CarCare’dagi sodda IsPaid flagiga qisqartirish foydali emas. [ARK invoice snapshot](https://github.com/EdwardSoaresJr/ark-core/blob/4234aca9a503b4fc209b4eb592564078e55cb730/app/Ark/Operations/Financial/InvoiceSnapshotBuilder.php), [CarCare invoice](https://github.com/rene98c/carcareco/blob/17cdd00c9877dbc0a6492ddf6dc09c8605319a79/backend/src/Carmasters.Domain/Pricings/Invoice.cs), [GarageOS payments](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/services/invoice_service.py#L486).

### E. Muhim xabar jarayon to‘xtaganda ham yo‘qolmasin — outbox

**Sodda misol:** “ish tugadi” bazaga yozildi, lekin dastur xabar yuborishdan oldin o‘chdi. Xabar ham shu tranzaksiyada bazaga vazifa sifatida yozilsa, keyin qayta yuborish mumkin.

**Kuzatuv:** GarageOS commitdan keyin xotiradagi eventlarni yuboradi; ADR0004 bu crash oynasini tan oladi. Diagramdagi “Event outbox” haqiqiy persistent outbox isboti emas. AWS rasmiy patternida biznes yozuvi va outbox bir tranzaksiyada saqlanadi; consumer takroriy xabarni taniy olishi kerak. [GarageOS UoW](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/repositories/unit_of_work.py#L57), [ADR0004](../ADRs/0004-event-driven-notifications.md), [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

**Taklif:** mijozga avtomatik muhim xabar yetkazish doiraga kirsa, persistent vazifa, retry va deduplicationni kelishish. Bu pattern uchun mikroservis yoki AWSga ko‘chish shart degan xulosa qilinmaydi. ARK event log’i ham o‘z-o‘zidan kafolatli outbox deb baholanmadi.

### F. Har avtoservisga alohida baza — boshqa tenant varianti

**Kuzatuv:** CarCare authenticated principal claimi asosida alohida PostgreSQL bazasini tanlaydi. GarageOS qabul qilingan ADR0005 asosida umumiy baza/schema va `service_center_id` ishlatadi; haqiqiy staff tenant’i joriy DB User’dan olinadi. [CarCare tenant driver](https://github.com/rene98c/carcareco/blob/17cdd00c9877dbc0a6492ddf6dc09c8605319a79/backend/src/Carmasters.Core.Repository.Postgres/NHibernate/MultiTenancyConnectionDriver.cs), [GarageOS deps](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/api/deps.py#L60), [ADR0005](../ADRs/0005-multi-tenancy-service-center-id.md).

**Taklif:** alternativni bilib qo‘yish foydali. Uni tanlashda servis boshiga migratsiya, backup va ulanishlarni boshqarish xarajati hisoblanadi. Bitta mijoz uchun bazani almashtirishga ushbu tadqiqot yetarli asos bermaydi.

### G. Foto va offline rejim — ekran qo‘shishdan kattaroq ish

Shopmonkey ko‘rikda status, qayd, media va tugatish tarixini; Tekmetric mobil inspectionda rasm/video va belgilashni hujjatlashtiradi. [Shopmonkey inspections](https://support.shopmonkey.io/hc/en-us/articles/38743049848852-Perform-Inspections), [Tekmetric DVI](https://www.tekmetric.com/feature/digital-vehicle-inspection).

GarageOS’da attachment URL metadata bor, lekin kamera → fayl yuklash → himoyalangan saqlash → checklist oqimi aniqlanmadi. Flutter’da umumiy offline sync yo‘q; faqat noaniq to‘lov natijasini bir xil UUID bilan qayta tekshirish saqlanadi. **Taklif:** foto/offline talabi bo‘lsa, saqlash, tenant huquqi, retry, backup va ikki qurilma tahriri kelishmovchiligini birga belgilash. [Attachment modeli](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/models/conversation.py#L187), [payment store](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/flutter_app/lib/data/payment_store.dart#L38).

## 5. GarageOS’da aniq tekshirilgan holatlar

| Holat | Dalil / oqibat |
| --- | --- |
| FastAPI + PostgreSQL modullari va bir nechta frontend | Mavjud backendni o‘rganilgan patternlar bilan bosqichma-bosqich kuchaytirish mumkin. [Production composition](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/docker-compose.prod.yml#L8). |
| Hisoblar ro‘yxati oxirgi 80 bilan cheklangan | Server query/pagination va Flutter bill search/page yo‘q. Bu allaqachon #10 dagi keyingi ish; tadqiqotda tuzatilmadi. [Kod](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/services/invoice_service.py#L590). |
| Usta ism matni bilan tayinlanadi | Bir xil ism yoki ism tahriri assignment/bandlik uchun noaniqlik tug‘dirishi mumkin. ID asosida tanlash — muhokama nomzodi. [Model](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/models/appointment.py#L43). |
| Mechanic hozir tenant staff ma’lumotini o‘qiydi, yozmaydi | My Work va moliyaviy nozik ruxsatlar uchun alohida API/rol siyosati kerak. [Policy](https://github.com/Shoamirg/garageos/blob/91a39797bfaf3d6e2217713eb14194dade82fd99/garageos/backend/app/core/staff_access.py#L9). |
| Estimate/approval, conversations va ledger backendda bor | Flutter’da ko‘rinmasa, butun tizimda yo‘q deb aytilmaydi. |
| Hujjatlar va kod ayrim joyda farq qiladi | Architecture overview persistent outboxni ko‘rsatadi; kod xotiradagi postcommit event. ADR0005 token tenant claimini aytadi; kod DB User’dan tenant oladi. Keyingi hujjat tuzatishlari uchun qayd; bu report ularni o‘zgartirmaydi. |

## 6. Qarorlar daraxti va tavsiya nomzodlari

**Oldingi kelishuvlar:** birinchi mijoz — bitta avtoservis; Flutter Android/iOS + mavjud API; UZ/EN/RU; tasdiqlangan oq/to‘q sariq dizayn; branch `codex/service-work-demo`; #10 delivery plan.

**Hozirgi grilling raundida so‘ralgan:** tadqiqotdan birinchi topshirishni yaxshilashmi yoki keyingi ko‘p avtoservis mahsulotini loyihalashmi; tasdiqlangan dizaynni saqlab interactionlarni o‘rganishmi yoki yangi dizaynlarni ham solishtirishmi. Javoblar kelmasdan yangi doira qo‘shilmaydi.

**Mening tavsiyam, hali qaror emas:**

1. Mavjud hisob tarixi/qidiruv cheklovini tugatish va topshirish gate’larini davom ettirish.
2. Usta tanlash hamda ikki xodimning hujjat tahriri kabi kundalik aniqlik muammolarini mijoz ish jarayoni bilan tekshirish.
3. Foto inspection, taklif versiyalari, My Work va ko‘p kunlik WorkOrder’ni mijoz ehtiyoji tasdiqlagan alohida incrementlarga ajratish.
4. Notification/outbox avtomatik muhim xabar talabi bilan; keng offline sync esa real uzilish ehtiyoji bilan bog‘liq. Har ikkalasi alohida qabul mezoniga ega bo‘lsin.

Keyingi savollar oldingi javoblarga bog‘liq: qaysi yangi oqimni kiritish → kim ishlatishi → zarur huquqlar/saqlanadigan ma’lumotlar → qabul mezoni. Foydalanuvchi qarori va yakuniy umumiy tushuncha tasdig‘idan oldin implementatsiya boshlanmaydi. Reja va ish ticketlari reportdan alohida #10/GitHub Issues’da yuritiladi.

## 7. Manbalarning chegarasi va tekshiruv

| Ochiq loyiha | O‘qilgan commit | Commit sanasi UTC | Litsenziya qaydi |
| --- | --- | --- | --- |
| ARK Core | `4234aca9a503b4fc209b4eb592564078e55cb730` | 2026-10-02 | README: AGPL-3.0-only |
| CarCare | `17cdd00c9877dbc0a6492ddf6dc09c8605319a79` | 2026-06-15 | GitHub: AGPL-3.0 |
| OpenAutoCore | `2ec59b3c7568b0c70bca03af3b6adfa7eb69906c` | 2025-12-03 | GitHub: GPL-3.0 |

Metadata va commitlar: [ARK](https://api.github.com/repos/EdwardSoaresJr/ark-core), [ARK commit](https://github.com/EdwardSoaresJr/ark-core/commit/4234aca9a503b4fc209b4eb592564078e55cb730), [CarCare](https://api.github.com/repos/rene98c/carcareco), [CarCare commit](https://github.com/rene98c/carcareco/commit/17cdd00c9877dbc0a6492ddf6dc09c8605319a79), [OpenAuto](https://api.github.com/repos/winterautollc/OpenAutoCore), [OpenAuto commit](https://github.com/winterautollc/OpenAutoCore/commit/2ec59b3c7568b0c70bca03af3b6adfa7eb69906c). Tekshiruv vaqtida uch repo archived emas, release/tag ro‘yxatlari bo‘sh edi. Activity real mijoz, uptime yoki correctness dalili emas. Litsenziya axborot sifatida qayd etildi; kod/asset ko‘chirilmadi.

Bu statik kod va ochiq ekran tadqiqoti. Yangi regressiya yoki production sinovi o‘tkazilmadi; hech qanday servis ishga tushirilmadi. Report tekshiruvi: manbalar, ichki havolalar va `git diff --check`. Oldingi test/build/CI dalillari #10 da alohida saqlanadi. Mijoz muhiti, signing, haqiqiy qurilma, backup va pilot gate’lari qolmoqda.
