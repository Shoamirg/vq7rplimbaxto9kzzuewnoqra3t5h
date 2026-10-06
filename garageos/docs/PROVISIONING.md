# Haqiqiy avtoservisni sozlash

Bu buyruq operator uchun: u bazaga kirish huquqi mavjud kompyuter yoki backend
konteynerida ishlaydi. Avtoservis va xodim hisoblarini yaratadi; mijoz, mashina,
navbat, hisob-faktura va to‘lov namunalarini qo‘shmaydi. Rol va mashina modellari
umumiy katalogini tayyorlaydi. Ommaviy ro‘yxatdan o‘tish ekrani emas.

## 1. Konfiguratsiyani tayyorlash

`backend/provisioning.example.json`dan nusxa olib, avtoservis va xodimlarning
haqiqiy ma’lumotlarini kiriting. `backend/garage.local.json` Git va backend Docker
build contextidan chiqarilgan; boshqa nomdagi shaxsiy manifestni ham Git/image
ichiga qo‘shmang.
Namuna ichidagi ismlar va email manzillarini almashtiring.

- `service_center.email`: avtoservisning barqaror identifikatori; boshqa servis
  bilan takrorlanmasin. `name` majburiy; `phone` va `address` ixtiyoriy.
- `timezone`: PostgreSQL tanigan vaqt zonasi; standart `Asia/Tashkent`.
  Bu sozlash mavjud navbat API’sining vaqt hisoblash usulini o‘zgartirmaydi.
- `staff`: kamida bitta `admin`; qolgan rollar `manager`, `receptionist`, `mechanic`.
  Email manzillar kichik harfga o‘tkaziladi va butun tizimda bitta hisobga tegishli.
- `full_name`: xodim ismi. Yangi tayinlovda usta akkaunt IDsi orqali tanlanadi;
  bir xil ismli ustalar email orqali ajratiladi. Eski ismli tayinlovlar
  avtomatik akkauntga bog‘lanmaydi.
- `password_env`: `GARAGEOS_STAFF_` bilan boshlanuvchi muhit o‘zgaruvchisi nomi.
  JSON ichida parol qiymati, `password`, `is_super_admin` yoki noma’lum maydon
  bo‘lishi rad etiladi. Yangi hisoblar platforma super admini bo‘lmaydi.

Hozirgi umumiy xodim panelida admin/manager/receptionist yozishi mumkin;
mechanic Flutter’dagi “Mening ishlarim” orqali faqat akkauntiga tayinlangan
ishlarni ko‘radi va boshlaydi/tugatadi. Mijozlar ro‘yxati, hisoblar, to‘lovlar
va boshqa ustalarning ishlariga kira olmaydi. Ishni admin ham avvalgi panelda
boshqarishi mumkin. [Usta oqimi](MECHANIC-WORKFLOW.md) va batafsil moliyaviy
huquqlarni mijoz pilotida tekshiring.

## 2. Windowsda ko‘rib chiqish va qo‘llash

Backend `.env` yoki jarayon muhitidagi `DATABASE_URL` **kerakli bazaga** qarayotganini
tekshiring. Staging/production uchun mavjud konfiguratsiya talablari ham amal qiladi.
Bu buyruq bazani yaratmaydi va migratsiya bajarmaydi; avval ularni tayyorlang.
Mavjud bazani migratsiya qilishdan oldin backup va tiklash sinovini bajaring.

`garageos/backend` ichida PowerShell:

```powershell
Copy-Item -LiteralPath provisioning.example.json -Destination garage.local.json
# garage.local.json ichidagi ma’lumotlarni tahrirlang
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.commands.provision --config garage.local.json
```

Standart buyruq faqat JSON reja chiqaradi: `applied: false`, yangi yozuv uchun
`create`, mavjud mos yozuv uchun `keep`. Rol/model katalogiga ham yozmaydi,
parol so‘ramaydi. Rejadagi email, rol va avtoservisni tekshiring.

Yangi hisoblar uchun parollarni alohida terminal sessiyasida yashirin kiriting.
Parol kamida 12 belgi, ko‘pi bilan 72 **UTF-8 bayt** bo‘lsin; faqat bo‘shliqlardan
iborat parol rad etiladi. `demo1234` kabi standart parol yo‘q.

Quyidagi nomlar misoldagi `password_env` qiymatlariga mos keladi:

```powershell
$staffSecret = Read-Host 'Admin paroli' -AsSecureString
$env:GARAGEOS_STAFF_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $staffSecret).Password
$staffSecret = Read-Host 'Qabul xodimi paroli' -AsSecureString
$env:GARAGEOS_STAFF_RECEPTION_PASSWORD = [Net.NetworkCredential]::new('', $staffSecret).Password
$staffSecret = Read-Host 'Usta paroli' -AsSecureString
$env:GARAGEOS_STAFF_MECHANIC_PASSWORD = [Net.NetworkCredential]::new('', $staffSecret).Password
try {
    .\.venv\Scripts\python.exe -m app.commands.provision --config garage.local.json --apply
    if ($LASTEXITCODE -ne 0) { throw 'Sozlash o‘tmadi; xabarni tekshiring.' }
} finally {
    Remove-Item Env:\GARAGEOS_STAFF_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\GARAGEOS_STAFF_RECEPTION_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\GARAGEOS_STAFF_MECHANIC_PASSWORD -ErrorAction SilentlyContinue
}
```

Natija `applied: true`, avtoservis/xodim UUIDlari va `created` yoki `kept` holatini
ko‘rsatadi. Parol va hash natijaga chiqarilmaydi. Xodimlarga ularning emaili va
parolini kelishilgan shaxsiy usulda yetkazing; chat/repo/loglarga joylamang.
Bu buyruqning o‘zi email yoki SMS jo‘natmaydi. Muhit qiymatlari jarayon davomida
xotirada mavjud: uni ishonchli operator terminalida ishlating.

## 3. Production Dockerda

Backend image yangi kod va `data/`, `alembic/` fayllarini o‘z ichiga olishi kerak.
Quyidagi buyruqlar `garageos/` ichida, production stack ishga tushganidan keyin
bajariladi. Haqiqiy `backend/garage.local.json`ni oldindan tayyorlang.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend python -m alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod cp backend/garage.local.json backend:/tmp/garage-provision.json
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend python -m app.commands.provision --config /tmp/garage-provision.json
```

Bashda yashirin kiritilgan vaqtinchalik qiymatlar `exec -e NAME` orqali
konteynerga uzatiladi. Parolni buyruq argumentiga `NAME=parol` qilib yozmang.

```bash
read -r -s -p 'Admin paroli: ' GARAGEOS_STAFF_ADMIN_PASSWORD
printf '\n'
read -r -s -p 'Qabul xodimi paroli: ' GARAGEOS_STAFF_RECEPTION_PASSWORD
printf '\n'
read -r -s -p 'Usta paroli: ' GARAGEOS_STAFF_MECHANIC_PASSWORD
printf '\n'
export GARAGEOS_STAFF_ADMIN_PASSWORD GARAGEOS_STAFF_RECEPTION_PASSWORD GARAGEOS_STAFF_MECHANIC_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T \
  -e GARAGEOS_STAFF_ADMIN_PASSWORD -e GARAGEOS_STAFF_RECEPTION_PASSWORD -e GARAGEOS_STAFF_MECHANIC_PASSWORD \
  backend python -m app.commands.provision --config /tmp/garage-provision.json --apply
setup_status=$?
unset GARAGEOS_STAFF_ADMIN_PASSWORD GARAGEOS_STAFF_RECEPTION_PASSWORD GARAGEOS_STAFF_MECHANIC_PASSWORD
test "$setup_status" -eq 0
```

`DEMO_MODE_ENABLED=false` holatini saqlang. Mijoz bazasida demo `--fresh` yoki
reset buyruqlarini ishlatmang. Docker orqali production tekshiruvi mahalliy
Windows/WSL testi bilan tasdiqlangan deb hisoblanmaydi.

## 4. Qayta ishlatish va xatolar

- Bir xil manifestni takrorlash mavjud UUID/parol/rol va yozuvlarni saqlaydi.
  Mavjud xodimlar uchun parol muhit o‘zgaruvchisi kerak emas; qiymat o‘zgargan
  bo‘lsa ham bu buyruq mavjud parolni yangilamaydi.
- Xodim qo‘shishda manifestda mavjud adminni saqlang, yangi xodimni qo‘shing,
  faqat yangi xodimning parol o‘zgaruvchisini bering. Ro‘yxatdan olib tashlangan
  xodim o‘chirilmaydi va bloklanmaydi.
- Avtoservisning **berilgan** maydonlari yoki xodim ismi/roli mavjud yozuvga
  mos kelmasa, buyruq to‘xtaydi. Parol almashtirish, rol o‘zgartirish,
  ko‘chirish yoki blokdan chiqarish rejimi yo‘q.
- Bloklangan avtoservis/xodim/global rol, boshqa servisga tegishli email yoki
  katta/kichik harf bilan takrorlangan eski email yozuvlari rad etiladi.
  Global rolni yoqish/o‘chirish barcha avtoservislarga ta’sir qiladi.
- Apply sozlash buyruqlari umumiy katalog sabab ketma-ket bajariladi. Boshqa
  vositalar ushbu lockdan foydalanmaydi; bazadagi constraint konflikti butun
  operatsiyani rollback qiladi.
- Validatsiya/preflight xatosi va odatiy tranzaksiya xatolarida qisman sozlash
  qolmaydi. Commit vaqtida ulanish uzilsa, natija noma’lum bo‘lishi mumkin:
  avval parolsiz reja buyrug‘i bilan bazadagi holatni ko‘ring, keyin takrorlang.
- Reja vaqtinchalik kuzatuvdir; apply joriy bazani qayta tekshiradi. Apply’dan
  keyin avtomatik o‘chirish yo‘q: mijoz yozuvlari paydo bo‘lishi mumkin.
  Productiondagi qaytarish uchun oldindan tekshirilgan backup tartibidan foydalaning.

## 5. Qabul tekshiruvi

Admin va qabul xodimi bilan kirib, bo‘sh mijoz/mashina/navbat/hisob ro‘yxatlarini
ko‘ring. Chevrolet/Cobalt kabi katalog modeli tanlanishi va yangi usta kalendarda
ko‘rinishini tekshiring. Keyin bitta sinov mijoz/mashina/navbatini yarating,
usta tayinlang, servis ishini boshlang/tugating va bitta UZS hisob yarating.
Usta hisobida yozish tugmalari berilmasligi va API yozishni rad etishi kerak.

Avtomatik regressiyalar: `python -m pytest tests/test_provisioning.py -q`.
Ular operator CLI, haqiqiy PostgreSQL va autentifikatsiyalangan API orqali
takrorlash, parallel sozlash, konflikt/rollback, migratsiya precondition,
parol chegaralari, servis jarayoni va ikki avtoservis izolatsiyasini tekshiradi.

Haqiqiy mijoz ma’lumotlari/akkauntlari, HTTPS hosting, signed Android/iOS,
jismoniy telefon sinovi va mijoz pilotini #10 bo‘yicha alohida yakunlash kerak.
