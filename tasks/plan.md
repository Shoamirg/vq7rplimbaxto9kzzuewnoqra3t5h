# GarageOS: productionga tayyorgarlik — 2026-10-14

Foydalanuvchi tasdiqlagan navbatdagi reja. Server hali tayyor emas; mavjud
Windows kompyuter, WSL/Docker, web panel va Android vositalari bilan ishlanadi.
Boshlang'ich HEAD: `27444a64bb05fee776eee3ac2cec4886b57b01dd`, repository
`C:/Users/u0129/Desktop/garageos-source`, branch `codex/service-work-demo`, PR5.
Vazifalar GitHub #10 va unga bog'liq mavjud issue'larda yuritiladi.

## Joriy bosqich — serversiz bajariladigan ishlar

- [x] 1. Proxy socket peer IP'sini ikkala upstreamda belgilash; soxta X-Real-IP
      va X-Forwarded-For regressionini RED -> GREEN tekshirish (8 routing tests).
- [x] 2. BFF canonical IP va 429/Retry-After/unavailable holatlarini UZ/EN/RU
      bilan uzatish; origin/session/fingerprint/unknown-mutation kontraktlari.
- [x] 3. Default botsiz production Compose va maxfiy qiymatlarni chiqarmaydigan
      read-only preflight; optional private readiness DB+Redis tekshiruvi.
- [x] 4. Backup jadvali, tekshirilgan tashqi nusxa va xato/stale backup monitoring
      vositalari; isolated archive/restore va failure regressionlari.
- [x] 5. Joriy Android native/emulator va mavjud physical-device imkoniyatlarini
      tekshirish; real server/key/telefon qabuli bo'lmasa uni aniq pending yozish.
- [ ] 6. Joriy handoff/release ko'rsatmalari, mustaqil review, yakuniy combined
      release tekshiruvi, evidence va GitHub own-branch publication.

Egalik: bosh agent Caddy, backup/monitor, native/runtime, hujjatlar, umumiy test
muhiti va Git/GitHub integratsiyasi; client agent faqat admin-dashboard; ops
agent Compose/env example/preflight va uning testlari; reviewer read-only.
Umumiy PostgreSQL/API/browser/Docker/native muhitini bosh agent boshqaradi.
Atomic commitlar; har behavior uchun meaningful RED/GREEN, keyin yakuniy SHA'da
bitta full release run. Unchanged testlar faqat reassurance uchun takrorlanmaydi.

## Server va mijozga bog'liq keyingi qabul

- [ ] 7. Aniq ruxsatli server, garageos.uz HTTPS, real servis/xodimlar va persistent
      deployment; restartdan keyin data saqlanishini tekshirish.
- [ ] 8. O'sha muhitda jadval/off-host nusxa, restore/rollback va monitoring qabuli.
- [ ] 9. Owner Android signing identity, real HTTPS API, o'rnatish/yangilash.
- [ ] 10. Bitta servisda kamida bir ish kuni pilot, support va mas'ul qabul.

Paid hosting/Apple enrollment, main merge/tag, deployment, private target accounts,
owner key yoki real-device acceptance ushbu serversiz increment natijasi emas.
iPhone tarqatish keyingi bosqichda qoladi. Eski hujjatlar bulk-restore qilinmaydi;
faqat joriy zarur ko'rsatmalar yoziladi. Private fixtures/JWT/dump/key GitHub'ga
chiqarilmaydi. Old stopped PGdata deletion policy rejection chetlab o'tilmaydi.

---

# Yakunlangan oldingi reja: Inbox qabuli va sessiya himoyasi

## Maqsad va ish joyi

Bitta servisning kundalik jarayonini ishonchli qilish: xodim kirishi, mijoz va
avtomobil, usta tayinlash, ishni boshlash/tugatish, hisob va to'lov qaydi.
Repository: `C:/Users/u0129/Desktop/garageos-source`; branch:
`codex/service-work-demo`; mavjud PR: https://github.com/Shoamirg/garageos/pull/5.
Boshlang'ich SHA: `b0864f91139cbf6924105b94d3e433a8b0e1af29`.
`C:/Users/u0129/Desktop/garageos` boshqa repository; unga tegilmaydi.

Asosiy talablar GitHub #10 (mijozga topshirish) va #39 (Inboxning barcha 13 guruhi).
Vazifalar mavjud GitHub Issues'da yuritiladi; bu fayl ijro tartibi va kontraktni
saqlaydi. Ochiq issue avtomatik ravishda bajarilmagan kod degani emas.

## Boshlang'ich dalillar

Saqlangan lokal natijalar: 925 backend testi, alohida qayta bajarilishda 535
brauzer testi, 92 Flutter testi va QA uchun 34 Android paketlash gate'i.
Bu alohida bajarilishlar; bitta to'liq muvaffaqiyatli CI emas. Eski browser run'da
bir ERR_NO_BUFFER_SPACE xatosi bo'lgan; keyingi to'liq browser run 535/535 o'tgan.
Production hosting, owner signing, haqiqiy telefon va mijoz piloti tasdiqlanmagan.

## Ijro va egalik

Bosh agent integratsiya, umumiy PostgreSQL/API/browser/Docker muhiti,
commit/push va hisobot uchun mas'ul. Ko'pi bilan uch subagent:

- Backend: app, migratsiya, backend testlari va fixture'lar.
- Klient: admin-dashboard va Flutter; backend fayllarini o'zgartirmaydi.
- Reviewer: Inboxning 13 talabi va keyin sessiya o'zgarishlarini mustaqil ko'radi.

Bitta faylni ikki agent parallel o'zgartirmaydi. Umumiy test muhitini faqat bosh
agent ishga tushiradi. Reviewer o'zi kod yozmaydi. Har incrementda tegishli
focused test, keyin integratsiyadan so'ng bitta to'liq release tekshiruvi.

## Bosqich A: holat va talablar

- [x] Mahalliy/remote branch, SHA, toza ishchi daraxt va agent qoidalari tekshirildi.
- [x] #39 uchun 13 qatorli talab -> kod -> test -> natija -> kamchilik jadvali.
- [x] Joriy dalillar GitHub'dagi eskirgan checkpointlar bilan yarashtirildi; original scope/history saqlandi.

Qabul: tayyor kodni qayta yaratmasdan, haqiqiy qolgan kamchiliklarni aniqlash.

## Bosqich B: Inbox

#39 ning to'liq asl scope'i saqlanadi: server literal search/paging/order;
filtered counts; joriy staff/tenant/reference/child chegarasi; bounded queue
queries va to'liq history; atomik create/update va alohida conversation/case
lifecycle; race-safe read/follow; loading/stale/error/revoked/deep-link holatlari;
captured-target/uncertain mutation va #38 replay qoidalari; haqiqiy linked context;
sakkiz real yoki aniq unavailable quick action; authorized UTF-8 JSON export;
UZ/EN/RU/keyboard/focus/44px/short-phone/light-dark/accessibility;
Operations/Mini/Flutter/financial/auth/event-bus kontraktlari.

- [x] Faqat aniqlangan xatti-harakat kamchiliklari tuzatildi.
- [x] Har 13 guruhga regressiya va joriy natija bog'landi; final combined run o'tdi.
- [x] Mustaqil spec/standards review va Inbox light/dark screenshots tekshirildi.

## Bosqich C: serverdagi sessiyalar

- [x] PostgreSQL sessiyasi principal turi/ID, servis, amaldagi refresh token
      xeshi, absolute expiry va revoked_at bilan saqlanadi; xom token saqlanmaydi.
- [x] Access va refresh `sid` (UUID) bilan bog'lanadi; refresh `jti` unique.
- [x] SELECT FOR UPDATE orqali atomik refresh rotation; eski refresh qayta
      ishlatilsa sessiya durably revoke bo'lib, keyin 401 qaytariladi.
- [x] Login/refresh commit bo'lmasdan muvaffaqiyatli token javobi berilmaydi.
- [x] Access current session/principal/role/garage holatini qayta tekshiradi.
- [x] Customer `account_version`, token types, demo va read-only chegaralari saqlanadi.
- [x] Supported staff/customer disable amallari sessiyalarni revoke qiladi;
      akkauntni qayta faollashtirish avvalgi sessiyani tiriltirmaydi.
- [x] Migratsiya upgrade/downgrade va schema metadata mosligi tekshirildi.

API kontrakti: login/refresh manzillari va access_token/refresh_token/token_type
response maydonlari saqlanadi. `POST /api/v1/auth/logout` va
`POST /api/v1/customer/auth/logout` qo'shiladi: bearer yoki optional JSON
`{refresh_token}` proof. Bearer mavjud bo'lsa ustuvor, invalid bearer'dan body'ga
fallback yo'q. Signed unexpired proof sid/sub/type bilan bog'liq sessiyani revoke
qiladi, already-revoked proof idempotent; success 200 `{ok:true}`, missing yoki
foreign/wrong-type proof 401. Bloklangan identity ham o'z sessiyasini revoke qila
oladi. Xom token faqat intended login/refresh response'da qaytariladi;
log/evidence/export yoki boshqa response'da chiqarilmaydi. Session hash va
private fixture response yoki public evidence'ga chiqmaydi.

Mavjud default muddatlar: access 30 daqiqa; sessiya login paytidan 7 kun.
Configured expiry saqlanadi, refresh absolute session expiry'ni uzaytirmaydi.
Eski sid-less tokenlar qayta kirishni talab qiladi; legacy password hash
compatibility saqlanadi. Testlarda bu deliberate compatibility change ochiq
tekshiriladi; production uchun sid-less bypass qo'shilmaydi.

## Bosqich D: klientlar

- [x] Brauzer access-only 30min tartibi saqlanadi; avtomatik browser refresh yo'q.
- [x] BFF logout backend revoke qiladi; BFF reachable bo'lsa, backend revocation
      unreachable holatda ham cookies va #38 message reset/purge tozalanadi,
      server revoke unconfirmed bo'lsa rost izoh. Browser->BFF network uzilsa,
      HttpOnly cookie'ni lokal JavaScript o'chira olmaydi; logout failure/retry
      holati ochiq ko'rsatiladi, muvaffaqiyat deb aytilmaydi.
- [x] Flutter refresh single-flight; logout/close'dan keyingi late response
      tokenlarni qayta o'rnata olmaydi.
- [x] Unknown refresh response/transport/5xx/malformed success'da eski refresh
      avtomatik qayta yuborilmaydi; mahalliy sessiya expire va deliberate login.
- [x] Flutter staff/customer logout server bilan ishlaydi, offline local clear ham mavjud.
- [x] To'lov/xabar unknown mutation avtomatik replay qilinmaydi.
- [x] Yangi holatlar UZ/EN/RU; tokenlar mavjud in-memory arxitekturadan chiqmaydi.

## Tekshiruv

Focused normal PostgreSQL/HTTP: rotation/replay, simultaneous refresh, access va
refresh after logout, suspended users/roles/garages, principal/tenant/type
chegaralari, commit failure, legacy hashes/invalid old token, demo va customer
version. Klient: single-flight, logout racing refresh, offline/unknown outcome,
local clear, deliberate reauth, no business write replay.

Yakuniy kodga bir to'liq run: backend+migrations/schema; typecheck/lint/locales/
dashboard build; full authenticated browser; Flutter analyze/locales/live API/web
build; audits; QA Android; Docker routing/build-context/recovery/invoice volume.
Changed UI: 360/390/1280 va short-phone, keyboard/light-dark va accessibility.

Existing runner: `garageos/scripts/jenkins_windows_ci.py`. System Python ishlatish
(managed venv'ni uning o'z executable'i bilan qayta yaratmaslik).
`WORKSPACE=C:/Users/u0129/Desktop/garageos-ci`, Linux Docker host:
`GARAGEOS_DOCKER_WSL_DISTRO=Ubuntu-24.04`. Parallel full runtimes yo'q.
Run xato bo'lsa root cause -> focused fix -> zarur gate; unchanged broad suites
as reassurance takrorlanmaydi. Interrupted run SUCCESS deb ko'rsatilmaydi.

## Yakunlash

- [x] Mustaqil review topilmalari hal qilingan; delayed SSR ham sessiyaga bog'langan.
- [x] Focused va final gate'lar, commit SHA va private evidence bog'langan.
- [x] Atomic commitlar o'z branchimizga push qilingan; remote va PR5 SHA tasdiqlangan.
- [x] PR5 va #39/#12/#10 aktual evidence bilan yangilangan; body va original scope saqlanishi qayta o'qib tekshirilgan.
- [x] Owned services/credential fixtures to'xtatilgan/olib tashlangan; quyidagi disk exception saqlangan.
- [x] O'zbekcha natija va external gate'lar `tasks/inbox-acceptance.md`da yozilgan; publication receipt quyida.

## Yakuniy tekshiruv dalili — 2026-10-14 (Tashkent)

Tested application/test SHA: `be24c902acb3030638d7d99994fa65d40fd4f5ae`.
`qa-session-inbox-final4-20261013-be24c90`: bitta to'liq lokal Windows runner,
exit0, tracked checkout toza; barcha Docker/application/recovery/invoice-volume
natijalari `passed`. 990 backend,574 authenticated Chromium (retries0),107
Flutter/live API testi o'tdi. Schema,TypeScript,lint,1458 browser keys/249 Flutter
messages, i18n audit0, Python55/55 va Node audits0, dashboard/web build va QA
Android34 gate o'tdi. Android3 ABI nusxalari QA kaliti bilan; private fixture
cleanup true, owner/physical device qabuli deb ko'rsatilmaydi.

Destructive downgrade testlari eski staff/customer token401 va real re-login'ni
endi ochiq tekshiradi. Read UUID422/new arrivals, yo'qolgan message receipt va
same key/payload talablari pasaytirilmagan. Historical seed modeli ham bugungi
auth-session jadvalini oldingi schema'ga qo'shmaydi. Old failed/interrupted
run'lar yakuniy muvaffaqiyat dalili emas.

Owned test ports55444/8010/3001 bo'sh, `owned.json` va credential fixture'lar
yo'q. Docker/private signing cleanup receipts true. Avtomatik approval review
to'xtatilgan test bazasi papkasini o'chirishni `blocked by policy` deb rad etdi;
PGdata papkalari diskda qoldi. Alternativ recursive deletion qilinmadi.

## GitHub publication receipt

Application/test va evidence commitlari `codex/service-work-demo`ga push qilindi.
`3389816e79394ce0d3f6430086730c4898efa51b` checkpointida remote branch va PR5
HEAD bir xil bo'ldi. PR5 title/body, #39/#12/#10 checkpointlari yangilandi;
GitHub'dan qayta o'qilgan body'lar yuborilgan fayllarga mos, barcha original
scope/history saqlangan. Issue'lar va PR review/merge yoki external acceptance
uchun OPEN qolgan.

GitHub check: CodeRabbit pass, lekin matni `Review skipped: manual review
required for this OSS repository`; bu test yoki haqiqiy bot-review dalili emas.
Joriy test/build dalili yuqoridagi exact-SHA lokal release run'dir.
Ushbu publication receipt va keyingi head yangilanishlari faqat Markdown
metadata: tested `be24c902...`dan application/test fayllari o'zgarmagan.

Main merge/tag, paid hosting, production deploy, owner signing keys va client
pilot bu bosqichda bajarilmaydi. Server, off-host backup/recovery/rollback,
Android/iOS distribution, physical phones, real workday pilot/support acceptance
keyingi aniq muhit bilan bajariladi. Butun loyiha 100% tayyor deyilmaydi.
