# Operator orqali superadmin akkaunti ochish

Bu buyruq backend/bazaga vakolatli operator uchun. Mavjud platforma paneliga
kiradigan **yangi** identifikator yaratadi; avtoservis egasi yoki boshqa xodimni
superadminga ko‘tarmaydi. Oddiy [avtoservis provisioning](PROVISIONING.md) va
adminning xodim sahifasi platforma huquqini bera olmaydi. HTTP orqali enrollment,
ommaviy ro‘yxatdan o‘tish, force/reset yoki mavjud akkauntni ko‘chirish yo‘q.

## Huquq va avtoservis bog‘lanishi

Platforma ko‘rish uchun faol akkaunt, faol `super_admin` roli, saqlangan
`is_super_admin=true` va faol bog‘langan avtoservis talab qilinadi. Demo token
bu ruxsatni bermaydi. Faqat rol yoki faqat flag yetarli emas.

Mavjud user modelida avtoservis UUIDsi majburiy. Operator **mavjud faol** servisni
aniq tanlaydi; buyruq sun’iy platforma servisi yaratmaydi. Shu servis to‘xtatilsa,
platforma akkauntining login/refresh va eski tokenlari ham rad etiladi.

Muhim huquq oqibati: hozirgi `super_admin` roli global `platform.read`dan tashqari
bog‘langan **bitta servisda** `staff.read` va `staff.write`ga ega. Global panel
GET-only bo‘lishi akkauntning tenant ichida faqat o‘qishini anglatmaydi. Reja
`access.platform` va `access.anchoring_garage`ni alohida chiqaradi. Operator
bu doirani ko‘rib, mos servis va alohida login tanlaydi. Global biznes yozish
yoki boshqa akkaunt nomidan kirish yo‘li qo‘shilmaydi.

## Manifest va oldindan tekshirish

Baza joriy Alembic revisionga yangilangan, kerakli servis va faol `super_admin`
katalog roli mavjud bo‘lsin. Dastlabki garage provisioning umumiy rol katalogini
tayyorlaydi. Bu buyruq migratsiya, garage yoki rol yaratish/reaktivatsiya qilmaydi.
`DATABASE_URL` kerakli bazaga qarayotganini private operator muhitida tekshiring.

`backend/platform-enrollment.example.json`dan private nusxa oling:

```json
{
  "service_center_id": "MAVJUD-FAOL-AVTOSERVIS-UUID",
  "full_name": "Vakolatli platforma operatorining ismi",
  "email": "haqiqiy-alohida-login@example.com",
  "password_env": "GARAGEOS_PLATFORM_PASSWORD"
}
```

UUID/ism/emailni haqiqiy qiymatlar bilan almashtiring. Email kichik harfga
o‘tkaziladi va staff login namespace’ida takrorlanmasin. JSONga parol qiymati,
hash, rol/flag yoki boshqa maydon qo‘shish rad etiladi. `password_env` faqat
`GARAGEOS_PLATFORM_` prefiksli muhit o‘zgaruvchisining **nomi** bo‘ladi.

`backend/platform.local.json` Git va backend Docker build contextidan chiqarilgan.
Boshqa nomli private manifestni source/image ichiga qo‘ymang; repo tashqarisida
saqlang. Bu faylda ham operator identifikatori bor: kirishni cheklang.

`garageos/backend/` ichida PowerShell:

```powershell
Copy-Item -LiteralPath platform-enrollment.example.json -Destination platform.local.json
# platform.local.json ichidagi UUID, ism va emailni tahrirlang.
.\.venv\Scripts\python.exe -m app.commands.enroll_platform --config platform.local.json
if ($LASTEXITCODE -ne 0) { throw 'Reja o‘tmadi; xavfsiz xabarni tekshiring.' }
```

Standart rejim `applied:false` va `account.state:create` yoki `keep` chiqaradi;
parol kerak emas, hech qanday yozuv/katalog o‘zgarmaydi. `account.id`, servis,
ism/email, fixed rol/flag va `access` doirasini ko‘ring. Reja keyingi apply uchun
doimiy kafolat emas: apply joriy bazani qayta tekshiradi.

## Yangi akkauntni qo‘llash

Yangi parol kamida 12 belgi, ko‘pi bilan 72 UTF-8 bayt va faqat bo‘shliqlardan
iborat bo‘lmasin. Muhit o‘zgaruvchisi nomi manifest bilan mos bo‘lsin. Qiymatni
terminal argumenti, JSON, log, GitHub yoki screenshotga yozmang.

```powershell
$platformSecret = Read-Host 'Yangi platforma akkaunti paroli' -AsSecureString
$env:GARAGEOS_PLATFORM_PASSWORD = [Net.NetworkCredential]::new('', $platformSecret).Password
try {
    .\.venv\Scripts\python.exe -m app.commands.enroll_platform --config platform.local.json --apply
    if ($LASTEXITCODE -ne 0) { throw 'Enrollment o‘tmadi; avval reja bilan holatni tekshiring.' }
} finally {
    Remove-Item Env:\GARAGEOS_PLATFORM_PASSWORD -ErrorAction SilentlyContinue
}
```

Natija `applied:true`, `account.state:created` yoki `kept`, UUID va doirani
ko‘rsatadi. Parol/hash ko‘rsatilmaydi. Apply operator provisioning bilan umumiy
transaction lockdan foydalanadi; parallel bir xil apply bitta akkauntga keladi.
CLI’ning xato kodi 2; SQL parametrlari, config/argument qiymatlari va traceback
xavfsiz xabarda chiqarilmaydi. Noto‘g‘ri DB/config sababini vakolatli operator
private muhitida tekshiradi; raw maxfiy muhitni ticketga ko‘chirmang.

Dockerda `garageos/`dan, oldindan private manifest tayyorlab, ishlab turgan
stackni tanlang:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod cp backend/platform.local.json backend:/tmp/platform-enrollment.json
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend python -m app.commands.enroll_platform --config /tmp/platform-enrollment.json
```

Rejani tekshirgach, manifestdagi nom uchun Bashda yashirin parol kiriting:

```bash
read -r -s -p 'Yangi platforma akkaunti paroli: ' GARAGEOS_PLATFORM_PASSWORD
printf '\n'
export GARAGEOS_PLATFORM_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T \
  -e GARAGEOS_PLATFORM_PASSWORD backend python -m app.commands.enroll_platform --config /tmp/platform-enrollment.json --apply
enrollment_status=$?
unset GARAGEOS_PLATFORM_PASSWORD
test "$enrollment_status" -eq 0
```

Parolni `-e NAME=parol` qilib argumentga qo‘ymang. Buyruq tugagach konteynerdagi
vaqtinchalik manifestni va ortiqcha private nusxalarni operatorning saqlash
tartibiga ko‘ra olib tashlang. Login/parolni faqat yangi operatorga shaxsiy
usulda yetkazing; CLI email/SMS yubormaydi.

## Takrorlash, konflikt va qabul

- Aynan mos faol platforma akkaunti takrorlanganda UUID, parol/hash, rol,
  servis va vaqt maydonlari saqlanadi; mavjud parol o‘zgaruvchisi kerak emas.
  Boshqa parol berilsa ham reset qilinmaydi.
- Oddiy xodim/admin, faqat rol/flagli eski identifikator, to‘xtatilgan akkaunt,
  boshqa servis, ism/email mos kelmasligi yoki case bilan takrorlangan email
  rad etiladi. Ularni overwrite, ko‘tarish yoki reaktivatsiya qilish yo‘q.
- Rol/servis yo‘q yoki faol emas, yoxud migratsiya hali qo‘llanmagan bo‘lsa,
  buyruq yozmaydi. Qo‘lda flag/rolni taxminiy o‘zgartirish bilan aylanib o‘tmang.
- Ulanish/commit xatosida natija noma’lum bo‘lishi mumkin. Avval passwordsiz
  default reja bilan bazadagi holatni ko‘ring; sabab tuzatilgach qayta apply
  qiling. Mavjud akkauntni qayta qo‘llash yangi parol bermaydi.

Haqiqiy HTTPS brauzerda yangi login bilan kiring: server tasdiqlagan platforma
paneli, kerakli barcha servislar va statistika ochilsin. Oddiy admin global
yozuvlarni ochmasin; tenant yozuvlari o‘z servisida qolsin. Operator va egasi
login/huquq hamda bog‘langan servisning to‘xtatilish oqibatini private
[topshirish varag‘ida](HANDOFF.md) qayd etadi.

`tests/test_platform_enrollment.py` haqiqiy CLI/PostgreSQL va authenticated
HTTP bilan tayyorgarlikni tekshiradi. Mahalliy synthetic akkaunt haqiqiy platforma
operatori, production hosting, telefon tarqatish yoki mijoz qabuli dalili emas.
