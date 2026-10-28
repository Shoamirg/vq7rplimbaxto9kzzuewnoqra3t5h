# Payme Merchant API — Integratsiya tayyorgarligi

## 1. Joriy holat va ko'lam

GarageOS loyihasida Payme to'lov tizimiga to'liq arxitektura va tranzaksiya kontraktlari tayyorlab qo'yilgan (`app/services/payment_gateway.py`), ammo foydalanuvchi qaroriga binoan jonli to'lov (live checkout) yo'li hozircha yoqilmagan. 

Mavjud to'lov holati:
- Xizmatlar uchun hisob-fakturalar qo'lda qayd etiladi (naqd pul, bank o'tkazmasi yoki POS terminal kartasi orqali).
- Onlayn to'lov shlyuzining barcha holat o'tishlari (state transitions) va qayta murojaat (idempotency replay) qoidalari sinovdan o'tkazilgan (`tests/test_payment_gateway_preparation.py`).

---

## 2. Payme JSON-RPC 2.0 Kontrakti

Payme Merchant API bilan o'zaro aloqa standart JSON-RPC 2.0 protokoli asosida amalga oshiriladi:

### Autentifikatsiya:
- HTTP sarlavhasi: `Authorization: Basic <base64("Paycom:" + PAYME_SECRET_KEY)>`
- Ruxsatsiz yoki noto'g'ri kalit bilan so'rovlar HTTP 200 ichida xato kodi `-32504` bilan rad etiladi.

### Tranzaksiya holatlari (`PaymentState`):
| Kod | Holat nomi | Tavsif |
|---|---|---|
| `1` | `CREATED` | Tranzaksiya yaratildi, to'lov kutilmoqda (check/reserve) |
| `2` | `COMPLETED` | To'lov muvaffaqiyatli amalga oshirildi va hisob-faktura yopildi |
| `-1` | `CANCELLED_BEFORE_PAYMENT` | To'lov amalga oshirilmasdan bekor qilindi |
| `-2` | `CANCELLED_AFTER_PAYMENT` | To'lovdan so'ng qaytarildi (refund) |

### Valyuta qoidasi (`uzs_to_minor`):
- O'zbekiston so'mi Payme tizimida tiyinlarda (1 UZS = 100 tiyin) hisoblanadi.
- Kichik yaxlitlash xatolariga yo'l qo'yilmaydi; kasr qiymat aniq butun songa aylanmasa, `-31001` (Invalid amount) xatosi qaytariladi.

---

## 3. Payme Metodlari va Ularning Javoblari

Payme yuboradigan 6 ta asosiy JSON-RPC metodi `PaymentGateway` interfeysida ko'zda tutilgan:

1. **`CheckPerformTransaction`**:
   - Parametrlar: `account.invoice_id`, `amount` (tiyinda).
   - Tekshiruv: Hisob-faktura mavjudligi, qoldiq summaning mosligi, allaqachon bekor qilinmaganligi.
   - Natija: `{ "allow": true }`.
   - Xatoliklar: Hisob topilmasa `-31050`, summa noto'g'ri bo'lsa `-31001`.

2. **`CreateTransaction`**:
   - Parametrlar: `id` (Payme tranzaksiya IDsi), `time`, `amount`, `account.invoice_id`.
   - Tekshiruv: Qayta takroriy so'rov (replay) bo'lsa, mavjud `PaymentAttempt` ma'lumotlarini qaytaradi.
   - Natija: `{ "create_time": 1234567890, "transaction": "...", "state": 1 }`.

3. **`PerformTransaction`**:
   - Parametrlar: `id` (Payme tranzaksiya IDsi).
   - Amal: Tranzaksiyani `COMPLETED (2)` holatiga o'tkazadi va atomik tranzaksiya (Unit of Work) ichida hisob-faktura balansiga to'lovni qayd etadi.
   - Natija: `{ "transaction": "...", "perform_time": 1234567890, "state": 2 }`.

4. **`CancelTransaction`**:
   - Parametrlar: `id`, `reason`.
   - Amal: Agar to'lov qilinmagan bo'lsa `-1`, to'lov qilingan bo'lsa `-2` holatiga o'tkaziladi.
   - Natija: `{ "transaction": "...", "cancel_time": 1234567890, "state": -1/-2 }`.

5. **`CheckTransaction`**:
   - Parametrlar: `id`.
   - Natija: Tranzaksiya joriy holati, yaratilgan, bajarilgan va bekor qilingan vaqtlari.

6. **`GetStatement`**:
   - Parametrlar: `from`, `to` (millisekundlarda vaqt oralig'i).
   - Natija: Berilgan vaqt oralig'idagi barcha tranzaksiyalar ro'yxati.

---

## 4. Keyinchalik Jonli Rejimga Ulash Qadamlari

Jonli Payme to'lovlarini faollashtirish zarur bo'lganda quyidagi qisqa amallar bajariladi:

1. **Konfiguratsiya**:
   `.env` yoki Railway Variables'ga quyidagilar kiritiladi:
   ```env
   PAYME_MERCHANT_ID=your_merchant_id_from_paycom_cabinet
   PAYME_SECRET_KEY=your_secret_test_or_prod_key
   PAYME_TEST_MODE=true
   ```

2. **Endpoint yaratish**:
   `app/api/v1/endpoints/payments.py` yaratilib, `POST /api/v1/payments/payme` marshruti qo'shiladi va Payme kabinetida webhook URL sifatida ko'rsatiladi:
   `https://api.garageos.uz/api/v1/payments/payme`

3. **Mijoz ilovasida to'lov tugmasini ochish**:
   Mobil ilovada (`billing.dart`) yoki web kabinetda hisob-fakturani Payme Checkout orqali to'lash havolasini ochish:
   `https://checkout.paycom.uz/<base64_encoded_invoice_data>`
