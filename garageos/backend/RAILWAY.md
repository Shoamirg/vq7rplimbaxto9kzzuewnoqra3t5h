# GarageOS backend — Railway

## Sozlash

GitHub repository: `Shoamirg/garageos`, branch: `codex/service-work-demo`.
Railway project ichida backend, PostgreSQL va Redis alohida xizmat bo'ladi.
PostgreSQL/Redis'ni bir xil environment'ga joylang; backend ularning private
URL'larini reference variable orqali ishlatadi. Database'larni internetga
chiqarish talab qilinmaydi. Telegram tokeni ushbu deploy uchun kerak emas.

Backend service **Settings**:

| Maydon | Qiymat |
| --- | --- |
| Root Directory | `/garageos/backend` |
| Builder | Avtomatik topilgan `Dockerfile` |
| Custom Build Command | Bo'sh |
| Custom Start Command | Bo'sh — Docker CMD ishlaydi |
| Pre-deploy Command | `alembic upgrade head` |
| Pre-deploy Timeout | `300` soniya |
| Healthcheck Path | `/ready` |
| Healthcheck Timeout | `300` soniya |
| Replicas | `1` |
| Watch Paths | `/garageos/backend/**` |

Eski `RAILWAY_DOCKERFILE_PATH`, custom build/start yoki config-file override
bo'lsa, shu backend sozlamalariga moslang. Yangi xizmatga eski `railway.json`
yoki `railway.toml` qo'shish kerak emas: Railway yangi xizmatlar uchun ularni
qabul qilmaydi. Ushbu yo'l Dockerfile va service Settings'dan foydalanadi.

Migratsiya build paytida yoki har worker startupida bajarilmaydi. Railway
pre-deploy uni alohida konteynerda private database bilan bajaradi; xato bo'lsa
yangi deploy ishga tushmaydi. Bir bazaga parallel deploy/migratsiya qilmang.

## Variables

[.env.example](.env.example) matnini **Variables → Raw Editor**ga moslab kiriting.
`Postgres` va `Redis` nomlari sizdagi service nomlari bilan bir xil bo'lishi kerak:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

Oddiy `postgres://` va `postgresql://` backendda avtomatik `asyncpg`ga moslanadi.
URL'dagi kodlangan parol va ulanish parametrlari saqlanadi. Private URL'lardan
foydalaning; parolni URL ichida qo'lda o'zgartirish talab qilinmaydi.

`SECRET_KEY` placeholderini o'zingiz yaratgan maxfiy qiymatga almashtiring:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Natijani faqat Railway secret variable'iga kiriting; GitHub yoki chatga yubormang.
Keyingi redeploylarda shu key saqlanadi. `CORS_ORIGINS`ga haqiqiy frontendning
aniq HTTPS originini yozing, masalan `https://garageos.uz`; path yoki `*` bo'lmasin.
Bir nechta origin vergul bilan ajratiladi. Production'da DEBUG va demo o'chirilgan.

`PORT`ni qo'lda belgilash shart emas: Railway uni beradi. Backend
`0.0.0.0:$PORT`da eshitadi; local Docker uchun default `8000`.
`WEB_CONCURRENCY=1` boshlang'ich qiymat. Uvicorn termination signalini oladi.

## Tarmoq va qabul

Backend **Networking → Generate Domain** orqali HTTPS manzil oladi. Railway
domainiga kiritilgan port shu service `PORT`i bilan mos bo'lsin. API manzili:
`https://BACKEND-DOMAIN/api/v1`; frontendga keyinchalik shu manzil beriladi.
`garageos.uz` DNS'ini almashtirish ushbu tayyorgarlik qadamiga kirmaydi.

`TRUST_PROXY_HEADERS=true` faqat Railway edge orqali kiradigan public backend
uchun. Railway bergan `X-Real-IP` auth rate limit kalitini belgilaydi. Backendga
boshqa proxy yoki private BFF qo'shilsa, uning client-IP kontraktini qayta
tekshiring; Caddy uchun dashboard flagini boshqa topologiyaga ko'chirmang.

Deploydan so'ng:

1. `/health` → 200; `/ready` → 200 va PostgreSQL/Redis `ok=true`.
2. `/version` → production, debug false; `/docs` → API hujjati.
3. Ruxsatsiz protected API → 401; haqiqiy xodim kirishi va o'z servisiga kirishi.
4. Noto'g'ri loginlar → limitdan keyin 429 va Retry-After. Almashtirilgan
   X-Real-IP/X-Forwarded-For limitni chetlab o'tmasligini live edge'da tekshiring.
5. Redeploydan keyin mijoz/avto/ish/hisob/to'lovlar saqlanishi.

Yangi database avtomatik demo/admin parol bilan to'ldirilmaydi. Haqiqiy servis va
xodim uchun mavjud `app.commands.provision` CLI'sini Railway backend konteynerida
private manifest/password environment bilan avval dry-run, so'ng `--apply` bilan
bajaring. [Operator yo'riqnomasi](../../../tasks/production-readiness.md#operator-tayyorgarligi).

Railway healthcheck faqat deploy paytida tekshiradi; doimiy monitoring o'rnini
bosmaydi. Real ma'lumot kiritishdan oldin backup/restore va operator mas'ulini
sozlang. Oldingi image'ga qaytishdan oldin schema mosligini tekshiring; oddiy
rollbackda database downgrade, reset yoki demo seed bajarilmaydi.

## Tekshiruv

```bash
cd garageos/backend
python -m pytest tests/test_database_url_config.py tests/test_production_config.py -q
cd ../..
python garageos/scripts/test_railway_backend.py --output ci-evidence/railway-backend
```

Ikkinchi buyruq Linux Docker/Compose talab qiladi; unique private QA resurslarini
yaratib, migratsiya, kodlangan DB paroli, custom PORT, auth/readiness/CORS va
cleanup'ni haqiqiy backend image bilan tekshiradi. Railway projectdagi live
deploy va edge qabuli alohida bajariladi.

Manbalar (2026-10-14 tekshirildi): [monorepo](https://docs.railway.com/deployments/monorepo),
[Dockerfile](https://docs.railway.com/builds/dockerfiles),
[pre-deploy](https://docs.railway.com/deployments/pre-deploy-command),
[healthcheck](https://docs.railway.com/deployments/healthchecks),
[edge headers](https://docs.railway.com/networking/public-networking/specs-and-limits),
[PostgreSQL](https://docs.railway.com/databases/postgresql),
[Redis](https://docs.railway.com/databases/redis),
[config lifecycle](https://docs.railway.com/config-as-code),
[Alembic URL escaping](https://alembic.sqlalchemy.org/en/latest/tutorial.html#escaping-characters-in-ini-files).
