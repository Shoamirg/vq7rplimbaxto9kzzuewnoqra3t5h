# GarageOS operatori uchun topshirish va foydalanishni saqlash

Bu tartib [#10 delivery rejasi](https://github.com/Shoamirg/garageos/issues/10)
uchun tayyorgarlikdir. Mijoz serveri, imzo kaliti, qurilma va pilotdagi natijalar
operator tomonidan haqiqiy muhitda tekshiriladi. Pastdagi bo‘sh varaq qabul
dalili emas. Uni yopiq saqlang; parol, token, keystore yoki backupning o‘zini
GitHub/repo/yordam ticketiga qo‘ymang.

Kundalik ishlatish: [O‘zbekcha yo‘riqnoma](USER-GUIDE.md).
Server: [DEPLOYMENT.md](DEPLOYMENT.md). Dastlabki servis/egasi:
[PROVISIONING.md](PROVISIONING.md). Mobil nusxa:
[Android](../flutter_app/docs/android-release.md),
[iOS](../flutter_app/docs/ios.md). Texnik chiqarish gate’lari:
[RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md).
Platforma operatori uchun alohida [superadmin enrollment](PLATFORM-ACCOUNTS.md)
tartibi bor; tenant owner akkauntini shu huquqqa avtomatik ko‘tarmang.

## 1. Birinchi foydalanishdan oldin

Operator va servis egasi quyidagilarni haqiqiy muhitda kelishib, yopiq varaqda
qayd etadi:

- Server egasi/ulanishi, domen/TLS, telefon uchun `https://<domen>/api/v1`,
  admin brauzer manzili, servis nomi va xodimlar. Public demo o‘chirilgan bo‘lsin.
- Admin, qabul/menejer, usta va mijoz loginlarini o‘z vazifalarida tekshirish.
  Parollar har bir egasiga shaxsiy usulda yetkaziladi; demo hisoblari ishlatilmaydi.
- Platforma operatori kerak bo‘lsa, alohida login va mavjud faol bog‘langan
  servisni tanlang. Global read hamda shu servisdagi mavjud staff.read/write
  doirasini operator bilsin; haqiqiy platforma login/chegaralarini ham tekshiring.
- Yordam mas’uli, yopiq aloqa, ish vaqti va favqulodda aloqa. Javob vaqti/SLA,
  ruxsat etilgan yo‘qotish davri (RPO) va qayta ishga tushirish muddati (RTO)
  egasi bilan kelishiladi; ushbu hujjat ularning qiymatini va’da qilmaydi.
- Joriy va yangi to‘liq commit SHA, konteyner image ID/digestlari, Compose
  project nomi/volume mapping, migration revision, sozlamalar va maxfiy
  qiymatlarning yopiq saqlash joyi. Oldingi image va sozlama nusxasi saqlansin.
- Android application ID, owner sertifikat SHA256, keystore backup egasi,
  API, build-name/build-number, APK/AAB hash va tarqatish kanali. Eski o‘rnatilgan
  nusxaga mos imzo va yuqoriroq versiya talab qilinadi. iPhone uchun Apple
  signing, Mac/Xcode va kelishilgan tarqatish kanali kerak.

Jenkins’dagi QA-ONLY APK, sintetik `.example` API yoki mahalliy emulyator
dalili mijozning o‘rnatiladigan relizi o‘rnini bosmaydi. Kompyuterdagi Jenkins
to‘xtashi serverdagi backup vazifasi ishlayotganini yoki ishlamayotganini
aniqlamaydi; ular alohida jarayonlar.

## 2. Backup va tiklashga mas’ul tartib

`backup.sh` bitta PostgreSQL bazasini dump qiladi. Jadval, retention va off-host
nusxa **operator sozlaydigan** ishlar; skript off-host nusxani o‘zi yubormaydi.
Deploy hujjatidagi cron misoli o‘rnatilgan jadval dalili emas.

1. Egasi bilan RPO/RTO, backup va off-host joy, saqlash muddati, disk hajmi,
   shifrlash/kirish va mas’ulni kelishing. Backup olinadigan vaqt zonasini yozing.
2. Haqiqiy stackda qo‘lda backup oling. Misol Bash/Linuxda, `garageos/` ish
   katalogidan; `.env.prod` operatorning ishonchli shell konfiguratsiyasi bo‘lsin:

   ```bash
   bash scripts/backup.sh
   bash scripts/restore-test.sh
   ```

   Ikkinchi buyruq eng yangi backupni alohida vaqtinchalik bazaga tiklaydi.
   Kerakli eski/off-hostdan qaytarilgan arxivni birinchi argument bilan aniq
   tanlang. `ENV_FILE`, `BACKUP_DIR` va `RETENTION_DAYS` variantlari
   [deploy hujjatida](DEPLOYMENT.md) va skriptlarda ko‘rsatilgan.
3. Backup tugashi/exit status, arxiv hash/hajmi/vaqti, off-host yetib borishi,
   yangi nusxa yoshi va disk hajmini monitoringga kiriting. Jadvaldan real run
   o‘tganini kuzating; xato/eski nusxa alerti qaysi odamga borishini tekshiring.
4. Boshqa joyga tiklab, joriy image bilan login, tenant chegarasi, mashina/ish/
   hisoblar va to‘lov tarixi/qoldig‘ini solishtiring. Jadval, grant, owner va
   sequence’larni ham tekshiring. Sintetik full-schema recovery gate uchun
   [DEPLOYMENT.md §5](DEPLOYMENT.md#5-backups) mavjud; client backup uchun
   haqiqiy manba/tiklangan natija va tekshiruvchi qayd etiladi.
5. Baza bilan birga cluster rollari/grantlarni qayta yaratish tartibi,
   `.env.prod`, DNS/proxy/TLS konfiguratsiyasi, kerakli image’lar, signing
   kalitlari va parollarni yopiq zaxiralash/qayta olish usulini tekshiring.
   `pg_dump` cluster-global rollarni/tablespace’larni zaxiralamaydi. Private
   nusxalarga kirishni kelishilgan boshqa mas’ul ham tiklashda sinay olsin.

`restore-test.sh` throwaway bazani tekshiradi; ishlab turgan bazani almashtirmaydi.
Haqiqiy qaytarish yangi alohida bazaga tiklash, vakolatli tekshiruv va ulanishni
ongli almashtirish orqali rejalashtiriladi. Faol bazaga oddiy SQL importi,
`--fresh`, volume o‘chirish yoki avtomatik schema downgrade qaytish rejasi emas.

## 3. Yangilash

Avval staging yoki alohida tiklangan nusxada candidate relizni tekshiring.
Mijoz uchun bajarish oldidan servis egasi tanaffusni va yangi yozuvlar qachon
to‘xtashi/qayta ochilishini bilsin. Barcha yozuvchi kanallar: brauzer, mobil,
bot va boshqa integratsiyalar hisobga olinadi.

1. Joriy commit/image/config/migration holatini yozing. Candidate to‘liq SHA
   va uning tekshiruvlarini ko‘ring; branch uchini avtomatik reliz deb olmang.
   `git fetch origin` kodni olish uchun; qaysi SHA ishlatilishini operator tanlaydi.
2. Yangilashdan oldin backup olib, aynan shu arxivni restore-test qiling va
   off-host nusxani tekshiring. Eski sozlama/image va qaytish rejasini saqlang.
   Operator avval yangi migratsiya bilan eski kod ishlashini tekshirgan bo‘lsin.
3. Tanaffusda yozishlarni to‘xtatib, oxirgi backup oling. Checkoutda noma’lum
   o‘zgarishlar qolmasin; tanlangan SHA, project nomi, env va volume mapping
   joriy stackka mosligini tekshiring. Deployning `garageos/` katalogida:

   ```bash
   set -euo pipefail
   : "${RELEASE_SHA:?Operator tekshirgan to‘liq commit SHAni kiriting}"
   test -z "$(git status --porcelain)"
   test "$(git rev-parse --verify "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA"
   git checkout --detach "$RELEASE_SHA"
   ```

   Yangi checkoutdagi Compose project/env/volume mappingni saqlangan holat bilan
   solishtiring; nom yoki joy o‘zgargan bo‘lsa start qilmang. Mapping tasdiqlanib,
   backup va qaytish preconditionlari bajarilgach:

   ```bash
   set -euo pipefail
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
   docker compose -f docker-compose.prod.yml --env-file .env.prod ps
   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend curl -fsS http://127.0.0.1:8000/ready
   ```

   Backend startup migratsiyani bajaradi. Shuning uchun build/start buyrug‘i
   backup/compatibility tekshiruvidan oldin bajarilmaydi. Bo‘sh boshqa bazani
   mijozning mavjud bazasi sifatida ochmang. `ps` va readiness yetarli qabul emas.
4. Haqiqiy HTTPS/brauzer va telefon loginlarini, mavjud yozuv/tarixni,
   yangi navbat → tayinlov → ish → hisob → qisman to‘lovni va tenant/rol
   cheklovlarini tekshiring. Natija yaxshi bo‘lsa yozishlarni qayta oching.
   Sinov yozuvi egasi bilan ajratib belgilanadi; tarixni yashirish uchun bazani reset qilmang.
5. Yangi image/config/revision va vaqtni varaqda saqlang. Xato chiqsa quyidagi
   qaytish qarorini bajaring; takroriy migratsiya/reset bilan taxmin qilmang.

Repo branchiga push qilish ishlab turgan mijoz serverini avtomatik yangilamaydi.
Merge, tag, server deploy va store publication alohida vakolatli qadamlardir.

## 4. Yangilanishdan qaytish

Yozishlarni pauzada saqlang; muammo va yangi yozuvlar chegarasini qayd eting.
Oldingi kod uchun ikki holat bor:

- **Migratsiyalangan baza mosligi isbotlangan:** saqlangan eski image va mos
  konfiguratsiyani qaytaring, o‘sha ma’lumot volumesini saqlang. Login,
  readiness va moliyaviy tekshiruvlarni takrorlang. Oldingi startup migratsiyasi
  joriy revisionni qabul qilishi ham stagingda isbotlangan bo‘lsin.
- **Moslik yo‘q yoki noma’lum:** backupni alohida yangi bazaga, kerakli rollar/
  owner/grant bilan tiklang. Oldingi image/config bilan shu bazada to‘liq
  tekshiring; operator tekshirgan ulanishni keyin almashtirsin. Yangilanishdan
  keyingi yozuvlar backupda bo‘lmasligi mumkin: egasi bilan yo‘qotish va
  solishtirib qayta kiritish qarorini kelishmasdan ulanishni almashtirmang.

Oldingi faol bazani/diskni darhol o‘chirmang; yopiq dalil va reconciliation
uchun saqlash muddati belgilanadi. `alembic downgrade` yoki live bazaga SQL
pipe bu qarorlarning o‘rnini bosmaydi. Target muhitdagi qaytish amalda
rehearsal qilinmagan bo‘lsa varaqda **kutilmoqda** qoladi.

## 5. Telefon va haqiqiy ish kuni qabuli

Android hamda iPhone’da owner imzoli tarqatilgan versiyani tekshiring. Joriy
o‘rnatilgan ilovani yangilash, login, klaviatura/kichik ekran, UZ/EN/RU,
qayta ochish, tarmoq yo‘qolishi va tiklanishi, usta boshlash/tugatish,
mijozning faqat o‘z tarixi, hisob va qisman/to‘liq to‘lov tekshirilsin.
Flutter noma’lum to‘lov natijasini o‘sha device/account/API bilan qayta
tekshirishda bitta receipt qolishini ko‘rsating. Kutilayotgan so‘rovlarni
hal qilmasdan uninstall/storage reset qilmang.

Kelishilgan haqiqiy yozuv hajmi, telefon va tarmoqda tezlikni o‘lchang;
[mahalliy hajm testi](PERFORMANCE.md) klient tezlik qabuli o‘rnini bosmaydi.
Pilotda egasi va xodimlari bir ish kunini bajaradi: qabul, real usta, servis,
bitta final hisob, pul qaydi, kun yakuni qoldiqlarini solishtirish. Yo‘riqnomadan
mustaqil foydalanish va yordamga murojaat qilishni ham tekshiring.
Qolgan nuqsonlar, mas’ul, muddat va egasining qabul qarori qayd etiladi.

## 6. Yordam uchun dalil va yopiq topshirish varag‘i

Muammo ticketida versiya/commit, vaqt/zona, rol, OS/brauzer, amal va xabar,
takrorlash qadamlarini yozing. Kerakli UUID/hisob raqami yopiq kanalga tegishli.
Screenshot/logda parol, token, to‘liq mijoz ro‘yxati va private konfiguratsiyani
yashiring. Noma’lum to‘lovni boshqa qurilmadan yangidan kiritishni tavsiya qilmang.
Tarmoq/server, rol/login, noma’lum pul natijasi yoki yangilanish xatosini tegishli
mas’ulga yuboring; kontakt va vaqt pastda kelishiladi.

Quyidagidan repo tashqarisida yopiq nusxa oling. Har bir dalil katagiga sana,
tekshiruvchi va saqlangan natija joyini yozing. Bo‘sh katak **kutilmoqda**:

| Maydon | Qiymat yoki dalil |
| --- | --- |
| Mijoz/servis va qabul qiluvchi egasi | |
| Server egasi, domen, brauzer/API, TLS va telefon ulanishi | |
| Joriy/yangi/oldingi SHA, image digest, migration revision | |
| Compose project/volume mapping va private config recovery joyi | |
| Admin/qabul/usta/mijoz rol va tenant tekshiruvlari | |
| Platforma login/anchoring garage va global/tenant huquq qabuli | |
| Android ID/owner certificate/hash/versiya/API/tarqatish dalili | |
| Owner keystore backup egasi va tiklash sinovi | |
| Apple signing/tarqatish, Android va iPhone qurilma dalillari | |
| Backup/retention/off-host jadvali, timezone va real run | |
| Oxirgi arxiv hash/vaqt, off-host qaytarish va tiklangan tekshiruv | |
| Cluster roles/grants/config/secret recovery tekshiruvi | |
| RPO/RTO, disk/backup yoshi monitoring va alert sinovi | |
| Yangilash tanaffusi, yozish chegarasi va target rollback rehearsal | |
| Haqiqiy hajm/device/network tezlik mezoni va natijasi | |
| Kunlik pilot, pul reconciliation va yo‘riqnoma tekshiruvi | |
| Yordam mas’uli/yopiq kanal/ish vaqti/favqulodda aloqa/SLA | |
| Qolgan nuqsonlar, mas’ul/muddat va egasining qabul qarori/sanasi | |

Tekshirilmagan gate’lar bilan topshirishni yakunlangan deb belgilamang.
GitHub #10da faqat sanitizatsiya qilingan commit/check holati va dalilga
ruxsatli havola bo‘lsin; yuqoridagi private varaqning o‘zi ochiq ticketga qo‘yilmaydi.
