# GarageOS’ni lokal demo rejimida ishga tushirish

Bu qo‘llanma GarageOS’ni bitta Windows kompyuterida, bulut xizmati yoki pulli hosting ishlatmasdan ko‘rish uchun. Sinov paytida faqat sun’iy ma’lumot kiriting; haqiqiy mijozlar ma’lumotlarini demo bazaga kiritmang. Ilova `localhost` manzillarida qoladi va internetga ochilmaydi.

## Kerak bo‘ladi

- Docker Desktop WSL 2 backend bilan ishga tushgan bo‘lishi kerak. `docker info` server qismiga xatosiz ulanishi shart.
- Node.js 24 va npm 11.21.0. Repo npm versiyasini aniq belgilagan.
- PowerShell.

Agar `docker info` Server qismiga ulana olmasa, Docker Desktop oynasida ko‘rsatilgan Engine holati yoki xatoni tekshiring. WSL 2 orqali Linux konteynerlarini ishlatganda `com.docker.service` to‘xtagani o‘zi sabab bo‘lmasligi kerak: Docker hujjatlariga ko‘ra bu xizmat Windows konteynerlari va Hyper-V backend uchun, WSL 2 backend uchun emas ([Windows ruxsatlari](https://docs.docker.com/desktop/setup/install/windows-permission-requirements/)). Shu sabab xizmatni ko‘r-ko‘rona qo‘lda ishga tushirmang; Docker Desktop ko‘rsatgan nosozlik matnini yoki diagnostic ID’ni oling. `5432`, `6379` yoki `8000` port band bo‘lsa, boshqa servisni to‘xtatmay xatoni yozib oling.

## 1. Demo backendni tayyorlash

PowerShell’da `docker-compose.yml` joylashgan `garageos` papkasiga o‘ting. Quyidagi buyruq `.env` fayli yo‘q bo‘lsa namuna yaratadi; mavjud `.env` faylini ustidan yozmang.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker info
```

`.env.example` ichidagi qiymatlar faqat lokal demo uchun. `.env` git’ga qo‘shilmaydi; uni hech kimga yubormang. `TELEGRAM_BOT_TOKEN` kerak emas. Nginx va Telegram botni bu ssenariy ishga tushirmaydi.

Bu demo uchun alohida Docker Compose loyiha nomi ishlatiladi. Bu GarageOS demo containerlari va volume’larini boshqa Compose loyihalaridan ajratadi. Host portlar (`5432`, `6379`, `8000`) esa kompyuterda umumiy; ular band bo‘lmasligi kerak.

```powershell
docker compose -p garageos-local-qa up -d --wait postgres redis
docker compose -p garageos-local-qa run --build --rm backend python -m alembic upgrade head
docker compose -p garageos-local-qa run --rm backend python -m app.seeds.demo
docker compose -p garageos-local-qa up -d backend
Invoke-RestMethod http://127.0.0.1:8000/ready
```

Oxirgi buyruq tayyorlik javobini qaytarsa, API ishga tushgan. Seed odatiy rejimda ma’lumot bor tenantni qayta to‘ldirmaydi. `--fresh` qo‘shmang: u demo tenantlardagi kiritilgan test ma’lumotlarini o‘chiradi va seed’ni boshidan yaratadi.

## 2. Dashboardni ishga tushirish

Boshqa PowerShell oynasini ochib yana `garageos` papkasiga o‘ting. Node versiyasini tekshiring:

```powershell
node --version
```

Ushbu oynada quyidagilarni bajaring. `npm ci` root lockfile bo‘yicha dependency’larni o‘rnatadi. Paketlar internetdan yuklanishi mumkin, lekin buyruq pulli hosting ochmaydi.

```powershell
$repo = (Get-Location).Path
Push-Location $env:TEMP
npx --yes --ignore-scripts --package=npm@11.21.0 npm --prefix $repo ci
Pop-Location

$env:NEXT_PUBLIC_API_URL = "http://localhost:8000/api/v1"
$env:NEXTAUTH_URL = "http://localhost:3000"
$env:NEXTAUTH_SECRET = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$env:NEXT_TELEMETRY_DISABLED = "1"
Push-Location $env:TEMP
npx --yes --ignore-scripts --package=npm@11.21.0 npm --prefix $repo --workspace admin-dashboard run dev -- --hostname 127.0.0.1
Pop-Location
```

Server ishlayotgan PowerShell oynasini yoping demaguncha ochiq qoldiring. Brauzerda [http://localhost:3000/login](http://localhost:3000/login) manziliga kiring. Faqat lokal demo uchun login:

- Email: `admin@demo.garageos.app`
- Parol: `demo1234`

Mexanik sinovi uchun demo login: `carlos.mendez@demo.garageos.app`, parol `demo1234`. Bular umumiy test hisoblari; ommaviy serverda ishlatmang. Ish buyurtmasi oqimini [pilot ro‘yxati](../../../docs/testing/work-order-pilot-checklist.md) bo‘yicha sinang.

## 3. To‘xtatish

Dashboard oynasida `Ctrl+C` bosing. Backend, Postgres va Redis’ni to‘xtatish uchun `garageos` papkasidagi PowerShell’da:

```powershell
docker compose -p garageos-local-qa down
```

Bu buyruq containerlarni to‘xtatadi, lekin demo volume’lardagi ma’lumotni saqlab qoladi. Volume’larni ham o‘chirish ma’lumotni yo‘qotadi; bu qo‘llanmada `down -v` ishlatilmaydi.

## Nosozlik bo‘lsa

Xato matnini, qaysi buyruq bajarganingizni va `docker compose -p garageos-local-qa ps` natijasini yozib oling. Token, parol yoki `.env` mazmunini yubormang. Lokal pilotdagi funksiyalar va natijalarni [pilot ro‘yxatida](../../../docs/testing/work-order-pilot-checklist.md) belgilang.
