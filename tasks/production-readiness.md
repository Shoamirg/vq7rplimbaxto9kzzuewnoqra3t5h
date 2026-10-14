# GarageOS: chiqarish va topshirish yo'riqnomasi

## Joriy yo'nalish

Server olinmaguncha mavjud Windows/WSL, web panel va Android vositalari bilan
tayyorgarlik qilinadi. Birinchi qabul — bitta servis, web va Android. iPhone
tarqatish keyingi bosqich. Server, real owner signing va physical-device/pilot
natijasi ushbu hujjat orqali tasdiqlanmaydi. Ish GitHub #10 va uning mavjud
bog'liq issue'lari, `codex/service-work-demo` va PR5 orqali yuritiladi.

Amaldagi mahsulot: xodim kiradi, mijoz/avtomobilni topadi yoki yaratadi, tashrif
yoki to'g'ridan-to'g'ri ish buyurtmasini ochadi, ustani tayinlaydi, ishni
boshlaydi/tugatadi, bitta yakuniy UZS hisob va qo'lda olingan pulni qayd etadi.
Mijoz password portali o'z tarixini o'qiydi. Usta o'ziga tayinlangan ishlar bilan
ishlaydi. Hisobga pul qayd etish karta orqali pul yechish degani emas.

## Qarorlar va kontraktlar

- Caddy socket peer IP'sini ikkala upstreamdagi `X-Real-IP`ga o'zi yozadi.
  Dashboard `NODE_ENV=production`, `GARAGEOS_TRUST_CADDY_IP=true` va mos
  Host/X-Forwarded-Host/Proto mavjud bo'lgandagina bitta IP'ni backendga uzatadi.
  Backend `TRUST_PROXY_HEADERS=true`, Redis rate limiting yoqilgan bo'ladi.
  Bu to'g'ridan-to'g'ri Caddy topologiyasi; CDN/tunnel keyin qo'shilsa, aniq
  ishonchli proxy chegarasi yana tekshiriladi. Backend/dashboard/DB/Redis portlari
  ommaga chiqarilmaydi.
- BFF `429` va protocol-valid `Retry-After`ni saqlaydi; foydalanuvchi kutib,
  qayta kirishni o'zi bosadi. Server/tarmoq/malformed javob xatosi uchun alohida
  UZ/EN/RU izoh. Login/logout origin, HttpOnly cookie va yangi sessiyani eski
  tabdan himoyalash kontraktlari saqlanadi.
- Telegram Compose profili default o'chirilgan. `--profile telegram` faqat
  haqiqiy token/Mini URL sozlangach yoqiladi. Demo/debug productionda o'chirilgan.
- Backup uchun existing Bash/PostgreSQL vositalari va pinned-key SSH nusxa
  tanlandi; qo'shimcha pullik storage integratsiyasi kiritilmadi. Nusxa masofada
  SHA256 bilan tekshirilmaguncha success/retention bajarilmaydi. Env fayl shell
  sifatida bajarilmaydi. Noaniq publish holatida eski/local/final remote nusxa
  saqlanadi; faqat shu run'ning temporary remote fayli tozalanadi.

## Operator tayyorgarligi

Ubuntu serverga Docker Compose, Python3, Bash, OpenSSH va systemd kerak.
Tasdiqlangan Git commit checkout'i `/opt/garageos`, app esa
`/opt/garageos/garageos` deb olinadi. Boshqa yo'l tanlansa, unitlardagi yo'llar
o'sha muhitga birga moslanadi. Quyidagi buyruqlar target server bosqichi uchun.

Production konfiguratsiyasi checkout tashqarisida `/etc/garageos/.env.prod`
faylida, owner-only permissions bilan saqlanadi. [Template](../garageos/.env.prod.example)
bo'yicha domain/contact, DB va generated signing secret to'ldiriladi. DB paroli
URL uchun xavfsiz kamida20 belgi, signing secret kamida32byte bo'ladi; generated
hex qiymatlar mos. Env/SSH/signing key, parol, JWT, SQL dump va private receipt
GitHub yoki ochiq logga chiqarilmaydi. Mavjud real signing identity almashtirilmaydi.

```bash
cd /opt/garageos/garageos
python3 scripts/production_preflight.py --env-file /etc/garageos/.env.prod
```

Preflight read-only: secret qiymatlarini chiqarmasdan flag/domain/CORS/DB/key,
rate-limit va effective Compose/private ports'ni tekshiradi. Exit0 barcha
checks o'tgan; exit1 fixed category bilan xato. Bu DNS/sertifikat yoki ishlayotgan
server qabuli emas. Serverga joylashda explicit shu env fayl ishlatiladi:

```bash
GARAGEOS_ENV_FILE=/etc/garageos/.env.prod docker compose \
  --env-file /etc/garageos/.env.prod -f docker-compose.prod.yml up -d --build
python3 scripts/production_preflight.py --env-file /etc/garageos/.env.prod --check-ready
```

Backend startup migratsiyani bajaradi. Real bazada yangilashdan oldin backup va
schema/application mosligi tekshiriladi. `/health` faqat process liveness;
`--check-ready` Docker ichidagi haqiqiy `/ready`dan PostgreSQL+Redis holatini
tekshiradi. Public `/ready` dashboardga boradi va readiness dalili bo'lmaydi.

Real servis/xodimlar [provisioning manifest](../garageos/backend/provisioning.example.json)
orqali tayyorlanadi. Private manifest va unda ko'rsatilgan password environment
qiymatlari backend konteyneriga maxfiy uzatiladi. `/app` ichida
`python -m app.commands.provision --config PRIVATE_MANIFEST` dry-run bajariladi;
operator `--apply` bilan yaratadi. Bu CLI host checkout'idan ishga tushirilmaydi.
Parollar `GARAGEOS_STAFF_*` environment nomlari orqali beriladi. Platform
operatorini yaratish alohida `app.commands.enroll_platform` CLI va mavjud servis
UUID'ini talab qiladi; ordinary staff avtomatik superadmin bo'lmaydi. Ushbu
tayyorgarlikda real akkauntlar yaratilmagan.

## Backup va kuzatuv

[Operations template](../garageos/operations/operations.env.example) dagi
SSH target, oldindan yaratilgan alohida private directory, owner-only identity
key va mustaqil tasdiqlangan host key fayli `/etc/garageos/operations.env`da
sozlanadi. Host trust verification chetlab o'tilmaydi. SSH target faqat
`user@host`, remote directory absolute bo'lib, space/metacharacter/parent-traversal
qabul qilinmaydi. Remote hostda SHA256 va atomik, no-clobber rename vositalari kerak.

`production_ops.py backup` uchun operations env qiymatlari systemd orqali
beriladi. Local archive gzip tekshiruvi, remote copy+checksum+publish o'tgach
private atomic receipt yoziladi; old local GarageOS nusxalari14kun saqlanadi.
Remote retention ushbu vosita orqali o'chirilmaydi; target operatori uchun
alohida storage policy va joy kuzatuvi topshirishda belgilanadi.

Unit template'lari [operations](../garageos/operations/) ichida. Targetda operator
ularni root-owned0644 sifatida o'rnatib, yo'llarni tekshiradi, birinchi backupni
qo'lda ishga tushirib natijani ko'radi, keyin backup/monitor timerlarini yoqadi.
Bu increment unitlarni o'rnatmaydi yoki timerlarni ishga tushirmaydi.

- Backup: har kuni03:00UTC (08:00Tashkent),0–5min randomized delay, missed run
  persistent. Service timeout45min; OS lock manual/timer parallel run'larini to'sadi.
- Monitor: bootdan5min keyin va har5min; core DB/Redis readiness, confirmed
  off-host backup26soatdan eski emasligi va local backup diskida kamida1GiB bo'sh joy.
- Failure: nonzero exit, fixed JSON categories va systemd OnFailure orqali
  mahalliy `GarageOS` error journal signal. Operator `journalctl` va
  `systemctl --failed`ni kuzatadi. Remote email/Telegram/support kanali target
  topshirishida mas'ul bilan alohida sozlanadi.

```bash
python3 scripts/production_ops.py check --env-file /etc/garageos/.env.prod \
  --backup-dir /var/lib/garageos/backups --receipt /var/lib/garageos/backup-status.json
ENV_FILE=/etc/garageos/.env.prod bash scripts/restore-test.sh /PRIVATE/backup.sql.gz
```

Restore-check alohida throwaway database'ga qiladi. Real tiklash/rollbackdan
oldin hozirgi data/config/roles/keys backup'i olinadi, backup alohida muhitga
tiklanadi, hisob va to'lovlar tekshiriladi. Old app version joriy schema bilan
mos bo'lsa faqat app qaytariladi. Destructive schema downgrade yoki SQL dumpni
ishlayotgan bazaga import qilish odatiy update/rollback qadamiga kirmaydi.
Auth-session jadvali yo'qolgan downgrade'dan so'ng eski tokenlar qayta ishlamaydi;
normal qayta kirish talab qilinadi. Restore data o'zgarishlarining va yozuvlar
vaqt chegarasining operator qarori target rehearsal'da qayd qilinadi.

## Android va mijoz qabul mezonlari

Current QA va emulator natijalari owner release/physical phone isboti emas.
Owner APK uchun complete private `GARAGEOS_ANDROID_SIGNING_PROPERTIES` yoki
to'rtta `GARAGEOS_ANDROID_KEYSTORE/STORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD`
environment qiymati, doimiy keystore backup'i va explicit real HTTPS API kerak.

```bash
flutter build apk --release --split-per-abi --dart-define=API_URL=https://garageos.uz/api/v1
```

Identity `uz.garageos.garageos_staff` va signer saqlanadi. Old distributed APK
version codes tekshirilib keyingi build number oshiriladi; QA/debug kaliti bilan
o'rnatilgan nusxa owner-key bilan update isboti sifatida qabul qilinmaydi.

Target qabul checklisti:

- HTTPS/login; haqiqiy servis/xodimlar; boshqa servis/mijoz ma'lumotiga kira olmaslik.
- Android haqiqiy qurilmada install/update, klaviatura/til/layout, qayta ochish,
  logout va tarmoq uzilishi; uncertain paymentni o'sha account/API/device'da
  avval tekshirish, duplicate qilmaslik.
- Server restart: mijoz/avto/ish/hisob/to'lovlar saqlanadi. Tashqi nusxadan
  alohida restore va mos rollback, failure journal signali amalda tekshirilgan.
- Vakillik qiladigan ma'lumot hajmi va bir vaqtdagi xodimlar bilan tezlik qayd
  etiladi; local synthetic HTTP natijasi target/WAN/telefon tezligi deb aytilmaydi.
- Bitta servisda kamida bir ish kuni: mijoz/avto -> ish -> usta -> tugatish ->
  bitta hisob -> qisman/to'liq to'lov. Ishni to'xtatuvchi xatolar yopilgan,
  mas'ul qabul qilgan, support kontakti va tiklash mas'uli privately yozilgan.

## Joriy tekshiruv dalili

Focused: Caddy 8 tests RED->GREEN; preflight 17; real Compose+units 2; ops 12;
backup CLI 16; production browser 42 (21 route/helper, 15 feedback, 6 phone),
retry 0. Phone tests UZ/EN/RU, light/dark va accessibility'ni qamraydi.
Real Caddy/Next/backend shared-quota testi o'tdi: ikki socket peer, har birida
native/BFF yo'llari uchun umumiy Redis hisoblagichi va 429/Retry-After tekshirildi.

Android emulatorida 3 native test o'tdi. Test paytidagi Flutter tree:
`ea2bdd935978a5e16898c485b0fc0658e766b87e`. Keyingi Flutter o'zgarishi faqat
shu yo'riqnomaga Markdown havola; compiled code o'zgarmagan. Physical device
ulanganligi tasdiqlanmagan. Yakuniy commitdagi to'liq release tekshiruvi hali pending.

Primary transport references: [Caddy headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults),
[OpenSSH](https://man.openbsd.org/ssh), [SCP](https://man.openbsd.org/scp).
