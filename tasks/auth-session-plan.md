# Reja: Refresh token sessiyalarini mustahkamlash

## Maqsad

Refresh tokenlarni takror ishlatish va logoutdan keyin qayta foydalanish imkonini yopish; staff dashboard hamda customer Mini App’da refresh tokenni server boshqaradigan HttpOnly cookie’da saqlash. API token juftligi javobi va access-token claimlari o‘zgarmaydi. Hosting/deploy bu ishga kirmaydi.

## Amalga oshirish

1. PostgreSQL’da raw token o‘rniga SHA-256 izi, principal, family va ishlatilgan/bekor qilingan vaqtlarni saqlash; Alembic migration qo‘shish.
2. Staff/customer login, refresh va logout oqimlarini bir martalik aylantirish, replay’da family revoke va avvaldan imzolangan tokenlar uchun bir martalik migratsiya bilan qoplash.
3. Staff dashboard va Mini App BFF refresh cookie’larini, server refresh handler’larini, logout revocation’ni va parallel brauzer so‘rovlarining single-flight himoyasini ulash.
4. PostgreSQL bilan integratsiya testlari, Next typecheck/lint/build va to‘liq tegishli regressiya testlarini bajarish.

## Qabul mezonlari

- [x] Raw refresh token DB’da saqlanmaydi; token digest yagona bo‘ladi.
- [x] Yangi refresh token bir marta ishlaydi; replay butun family’ni bekor qiladi.
- [x] Logoutdan keyin refresh ishlamaydi; eski, hali ishlatilmagan token faqat bir marta migratsiya qilinadi.
- [x] Staff/customer access va refresh tokenlari bir-birining endpointida ishlamaydi; demo readonly claimi refreshdan keyin saqlanadi.
- [x] BFF refresh tokenni HttpOnly, SameSite=Lax cookie’da saqlaydi; client JavaScript tokenni olmaydi.
- [x] Mavjud API response shakli saqlanadi; lokaldagi test/buildlar o‘tadi.
- [x] Production deploy qilinmaydi.

## Tekshiruv natijasi

- Backend: migration `upgrade head` muvaffaqiyatli; 179 pytest testi o‘tdi.
- Browser: Playwright 20/20; staff va customer BFF cookie rotation, logout revocation hamda cross-site so‘rov rad etilishi tekshirildi.
- Frontend: TypeScript, ESLint, i18n va production build muvaffaqiyatli. ESLint’da faqat marketing sahifasidagi avvaldan mavjud 2 ta `<img>` ogohlantirishi qoldi.
- Production va pulli hosting ishlatilmadi.

## Qayd

Asosiy arxitektura qarori: [ADR-002](../docs/decisions/ADR-002-stateful-refresh-sessions.md). Avvalgi ish buyurtmasi rejasi va servis pilotining ochiq bandlari o‘zgartirilmaydi.
