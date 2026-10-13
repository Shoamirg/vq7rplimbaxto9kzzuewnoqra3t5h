# GarageOS: Inbox qabuli va sessiya himoyasi

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
- [ ] #39 uchun 13 qatorli talab -> kod -> test -> natija -> kamchilik jadvali.
- [ ] Joriy dalillar GitHub'dagi eskirgan checkpointlar bilan yarashtiriladi.

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

- [ ] Faqat aniqlangan xatti-harakat kamchiliklari tuzatiladi.
- [ ] Har 13 guruhga aniq regressiya va natija bog'lanadi.
- [ ] Mustaqil spec/standards review va zarur screenshots tekshiriladi.

## Bosqich C: serverdagi sessiyalar

- [ ] PostgreSQL sessiyasi principal turi/ID, servis, amaldagi refresh token
      xeshi, absolute expiry va revoked_at bilan saqlanadi; xom token saqlanmaydi.
- [ ] Access va refresh `sid` (UUID) bilan bog'lanadi; refresh `jti` unique.
- [ ] SELECT FOR UPDATE orqali atomik refresh rotation; eski refresh qayta
      ishlatilsa sessiya durably revoke bo'lib, keyin 401 qaytariladi.
- [ ] Login/refresh commit bo'lmasdan muvaffaqiyatli token javobi berilmaydi.
- [ ] Access current session/principal/role/garage holatini qayta tekshiradi.
- [ ] Customer `account_version`, token types, demo va read-only chegaralari saqlanadi.
- [ ] Supported staff/customer disable amallari sessiyalarni revoke qiladi;
      akkauntni qayta faollashtirish avvalgi sessiyani tiriltirmaydi.
- [ ] Migratsiya upgrade/downgrade va schema metadata mosligi tekshiriladi.

API kontrakti: login/refresh manzillari va access_token/refresh_token/token_type
response maydonlari saqlanadi. `POST /api/v1/auth/logout` va
`POST /api/v1/customer/auth/logout` qo'shiladi: bearer yoki optional JSON
`{refresh_token}` proof. Bearer mavjud bo'lsa ustuvor, invalid bearer'dan body'ga
fallback yo'q. Signed unexpired proof sid/sub/type bilan bog'liq sessiyani revoke
qiladi, already-revoked proof idempotent; success 200 `{ok:true}`, missing yoki
foreign/wrong-type proof 401. Bloklangan identity ham o'z sessiyasini revoke qila
oladi. Token/hash/private fixture log yoki response'ga chiqmaydi.

Mavjud default muddatlar: access 30 daqiqa; sessiya login paytidan 7 kun.
Configured expiry saqlanadi, refresh absolute session expiry'ni uzaytirmaydi.
Eski sid-less tokenlar qayta kirishni talab qiladi; legacy password hash
compatibility saqlanadi. Testlarda bu deliberate compatibility change ochiq
tekshiriladi; production uchun sid-less bypass qo'shilmaydi.

## Bosqich D: klientlar

- [ ] Brauzer access-only 30min tartibi saqlanadi; avtomatik browser refresh yo'q.
- [ ] BFF logout backend revoke qiladi; cookies va #38 message reset/purge
      offline holatda ham tozalanadi, server revoke unconfirmed bo'lsa rost izoh.
- [ ] Flutter refresh single-flight; logout/close'dan keyingi late response
      tokenlarni qayta o'rnata olmaydi.
- [ ] Unknown refresh response/transport/5xx/malformed success'da eski refresh
      avtomatik qayta yuborilmaydi; mahalliy sessiya expire va deliberate login.
- [ ] Staff/customer logout server bilan ishlaydi, offline local clear ham mavjud.
- [ ] To'lov/xabar unknown mutation avtomatik replay qilinmaydi.
- [ ] Yangi holatlar UZ/EN/RU; tokenlar mavjud in-memory arxitekturadan chiqmaydi.

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

- [ ] Mustaqil review topilmalari hal qilingan.
- [ ] Focused va final gate'lar, commit SHA va private evidence bog'langan.
- [ ] Atomic commitlar o'z branchimizga push qilingan; remote SHA tasdiqlangan.
- [ ] PR5 va tegishli issue'lar aktual evidence bilan yangilangan.
- [ ] Faqat owned services/credentials/resources tozalangan.
- [ ] O'zbekcha hisobot: nima o'zgardi, testlar, push SHA, qolgan external gate'lar.

Main merge/tag, paid hosting, production deploy, owner signing keys va client
pilot bu bosqichda bajarilmaydi. Server, off-host backup/recovery/rollback,
Android/iOS distribution, physical phones, real workday pilot/support acceptance
keyingi aniq muhit bilan bajariladi. Butun loyiha 100% tayyor deyilmaydi.
