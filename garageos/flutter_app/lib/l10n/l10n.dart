import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../domain/models.dart';
import 'generated/app_localizations.dart';
import 'generated/app_localizations_uz.dart';

extension LocalizedContext on BuildContext {
  // Isolated widget previews keep the application's Uzbek default.
  AppLocalizations get l10n =>
      AppLocalizations.of(this) ?? AppLocalizationsUz();

  String date(DateTime value) =>
      DateFormat.yMMMMd(l10n.localeName).format(value);

  String money(Money value, [String currency = 'UZS']) {
    final decimals = currency != 'UZS' || value.cents % 100 != 0 ? 2 : 0;
    final formatter = NumberFormat.decimalPattern(l10n.localeName)
      ..minimumFractionDigits = decimals
      ..maximumFractionDigits = decimals;
    final number = formatter
        .format(value.cents.abs() / 100)
        .replaceAll('\u00a0', ' ')
        .replaceAll('\u202f', ' ');
    return '${value.cents < 0 ? '−' : ''}$number ${currency == 'UZS' ? l10n.uzs : currency}';
  }

  String? validation(String? value) => value == null ? null : message(value);

  // These are app-owned transport/domain labels; never translate customer
  // names, notes, line descriptions or other server-provided content.
  String message(String value) => switch (value) {
    "Email manzilini kiriting." ||
    "Enter a valid email address." ||
    "Введите корректный адрес электронной почты." => l10n.emailError,
    "Kamida 6 ta belgi kiriting." ||
    "Enter at least 6 characters." ||
    "Введите не менее 6 символов." => l10n.passwordError,
    "Avval mijoz va mashinani tanlang." ||
    "Select a customer and vehicle first." ||
    "Сначала выберите клиента и автомобиль." => l10n.pickCustomerError,
    "Bu maydonni toʻldiring." ||
    "Fill in this field." ||
    "Заполните это поле." => l10n.requiredField,
    "Toʻgʻri telefon raqamini kiriting." ||
    "Enter a valid phone number." ||
    "Введите корректный номер телефона." => l10n.phoneError,
    "Davlat raqamini kiriting." ||
    "Enter a license plate." ||
    "Введите госномер." => l10n.plateError,
    "Toʻgʻri yilni kiriting." ||
    "Enter a valid year." ||
    "Введите корректный год." => l10n.yearError,
    "Toʻgʻri masofani kiriting." ||
    "Enter a valid mileage." ||
    "Введите корректный пробег." => l10n.odometerError,
    "Jami summa 0 dan katta va 100 million soʻmdan kam boʻlsin." ||
    "Total must be greater than zero and less than 100 million UZS." ||
    "Итог должен быть больше нуля и меньше 100 миллионов сумов." =>
      l10n.invoiceTotalError,
    "Musbat miqdorni kiriting." ||
    "Enter a positive quantity." ||
    "Введите положительное количество." => l10n.quantityError,
    "Toʻgʻri narxni kiriting." ||
    "Enter a valid price." ||
    "Введите корректную цену." => l10n.priceError,
    "Qator summasi 100 million soʻmdan kam boʻlsin." ||
    "Line total must be less than 100 million UZS." ||
    "Сумма строки должна быть меньше 100 миллионов сумов." =>
      l10n.lineTotalError,
    "Musbat summa kiriting; qoldiqdan oshmasin." ||
    "Enter a positive amount that does not exceed the balance." ||
    "Введите положительную сумму не больше остатка." => l10n.paymentAmountError,
    "Tasdiq kutilmoqda" ||
    "Awaiting confirmation" ||
    "Ожидает подтверждения" => l10n.workPending,
    "Tasdiqlangan" || "Confirmed" || "Подтверждена" => l10n.workConfirmed,
    "Servisda" || "In service" || "В работе" => l10n.workInProgress,
    "Tugagan" || "Completed" || "Завершена" => l10n.workDone,
    "Bekor qilingan" || "Cancelled" || "Отменена" => l10n.cancelled,
    "Koʻchirilgan" || "Rescheduled" || "Перенесена" => l10n.rescheduled,
    "Boshqa holat" || "Other status" || "Другой статус" => l10n.unknownStatus,
    "Naqd" || "Cash" || "Наличные" => l10n.cash,
    "Terminal / karta" || "Terminal / card" || "Терминал / карта" => l10n.card,
    "Bank oʻtkazma" ||
    "Bank transfer" ||
    "Банковский перевод" => l10n.bankTransfer,
    "Onlayn" || "Online" || "Онлайн" => l10n.online,
    "Boshqa" || "Other" || "Другое" => l10n.other,
    "Toʻlanmagan" || "Unpaid" || "Не оплачен" => l10n.unpaid,
    "Qisman toʻlangan" ||
    "Partially paid" ||
    "Частично оплачен" => l10n.partiallyPaid,
    "Toʻlangan" || "Paid" || "Оплачен" => l10n.paid,
    "Muddati oʻtgan" || "Overdue" || "Просрочен" => l10n.overdue,
    "Qaytarilgan" || "Refunded" || "Возвращён" => l10n.refunded,
    "Qoralama" || "Draft" || "Черновик" => l10n.draft,
    "Yuborilgan" || "Sent" || "Отправлен" => l10n.sent,
    "Maʼlumotni olishda xatolik yuz berdi. Qayta urinib koʻring." ||
    "Could not load the data. Try again." ||
    "Не удалось получить данные. Повторите попытку." => l10n.genericError,
    "API manzilini /api/v1 bilan kiriting." ||
    "Enter an API address ending in /api/v1." ||
    "Введите адрес API, заканчивающийся на /api/v1." => l10n.apiAddressError,
    "HTTPS API manzilini kiriting." => l10n.apiHttpsRequired,
    "Server javobini oʻqib boʻlmadi." ||
    "Could not read the server response." ||
    "Не удалось прочитать ответ сервера." => l10n.serverResponseError,
    "Email yoki parol notoʻgʻri." ||
    "Incorrect email or password." ||
    "Неверная почта или пароль." => l10n.credentialsError,
    "Bu vaqtda usta yoki mashina band. Boshqa vaqtni tanlang." ||
    "The mechanic or vehicle is busy at this time. Choose another time." ||
    "Механик или автомобиль занят в это время. Выберите другое время." =>
      l10n.appointmentConflict,
    "Bu telefon bilan mijoz mavjud. Qidiruvdan toping." ||
    "A customer with this phone already exists. Find them in search." ||
    "Клиент с таким телефоном уже есть. Найдите его через поиск." =>
      l10n.duplicatePhone,
    "Bu davlat raqami yoki VIN allaqachon mavjud." ||
    "This license plate or VIN already exists." ||
    "Этот госномер или VIN уже существует." => l10n.duplicateVehicle,
    "Ish holati oʻzgargan. Sahifani yangilang." ||
    "The work status changed. Refresh the page." ||
    "Статус работы изменился. Обновите страницу." => l10n.workStateChanged,
    "Toʻlov qolgan summadan oshib ketdi. Hisobni yangilang." ||
    "Payment exceeds the remaining balance. Refresh the invoice." ||
    "Платёж превышает остаток. Обновите счёт." => l10n.paymentExceedsBalance,
    "Toʻlov tafsilotlari oʻzgargan. Hisobni tekshiring." ||
    "Payment details changed. Check the invoice." ||
    "Данные платежа изменились. Проверьте счёт." => l10n.paymentMismatch,
    "Bu holatdagi hisobga toʻlov yozib boʻlmaydi." ||
    "Payments cannot be recorded for an invoice in this state." ||
    "В этом состоянии счёта нельзя записать платёж." =>
      l10n.invoicePaymentStateError,
    "Kirish muddati tugadi. Qayta kiring." ||
    "Your session expired. Sign in again." ||
    "Сеанс истёк. Войдите снова." => l10n.sessionExpired,
    "Bu amal uchun ruxsat yoʻq." ||
    "You do not have permission for this action." ||
    "У вас нет разрешения на это действие." => l10n.forbidden,
    "Maʼlumot topilmadi. Roʻyxatni yangilang." ||
    "Data not found. Refresh the list." ||
    "Данные не найдены. Обновите список." => l10n.notFound,
    "Maʼlumot oʻzgargan yoki band. Yangilab, qayta tekshiring." ||
    "Data changed or is busy. Refresh and check again." ||
    "Данные изменились или заняты. Обновите и проверьте снова." =>
      l10n.conflict,
    "Kiritilgan maʼlumotlarni tekshiring." ||
    "Check the information you entered." ||
    "Проверьте введённые данные." => l10n.invalidData,
    "Soʻrovlar koʻpaydi. Biroz kutib qayta urinib koʻring." ||
    "Too many requests. Wait a moment and try again." ||
    "Слишком много запросов. Подождите и повторите попытку." =>
      l10n.tooManyRequests,
    "Serverda xatolik yuz berdi. Qayta urinib koʻring." ||
    "A server error occurred. Try again." ||
    "Ошибка сервера. Повторите попытку." => l10n.serverError,
    "Javob kelmadi. Ulanishni tekshirib qayta urinib koʻring." ||
    "No response. Check your connection and try again." ||
    "Нет ответа. Проверьте подключение и повторите попытку." =>
      l10n.timeoutError,
    "Serverga ulanib boʻlmadi. Internet va API manzilini tekshiring." ||
    "Could not connect to the server. Check the connection and API address." ||
    "Не удалось подключиться к серверу. Проверьте сеть и адрес API." =>
      l10n.connectionError,
    "Avval ish holati va usta tayinlanganini tekshiring." ||
    "Check the work status and mechanic assignment first." ||
    "Сначала проверьте статус работы и назначение механика." =>
      l10n.mechanicStateError,
    "Bu davlat raqami allaqachon mavjud." ||
    "This license plate already exists." ||
    "Этот госномер уже существует." => l10n.duplicatePlate,
    "Avval servis ishini tugating." ||
    "Complete the service work first." ||
    "Сначала завершите сервисную работу." => l10n.completeFirst,
    "Toʻlov musbat boʻlsin va qolgan summadan oshmasin." ||
    "Payment must be positive and not exceed the balance." ||
    "Платёж должен быть положительным и не больше остатка." =>
      l10n.demoPaymentAmountError,
    "Oldingi toʻlov soʻrovini oʻqib boʻlmadi. Hisob tarixini tekshiring." ||
    "Could not read the previous payment request. Check invoice history." ||
    "Не удалось прочитать предыдущий запрос оплаты. Проверьте историю счёта." =>
      l10n.paymentReadError,
    "Toʻlov soʻrovini qurilmada saqlab boʻlmadi. Qayta urinib koʻring." ||
    "Could not save the payment request on this device. Try again." ||
    "Не удалось сохранить запрос оплаты на устройстве. Повторите попытку." =>
      l10n.paymentStoreError,
    "Toʻlov javobi olindi. Soʻrovni yakunlash uchun qayta tekshiring." ||
    "Payment response received. Check again to finish the request." ||
    "Ответ по платежу получен. Проверьте снова, чтобы завершить запрос." =>
      l10n.paymentFinishError,
    "Til tanlovi saqlanmadi. Keyingi safar qayta tanlang." ||
    "Language preference was not saved. Select it again next time." ||
    "Выбор языка не сохранён. Выберите его снова при следующем запуске." =>
      l10n.preferenceSaveError,
    _ => value,
  };
}
