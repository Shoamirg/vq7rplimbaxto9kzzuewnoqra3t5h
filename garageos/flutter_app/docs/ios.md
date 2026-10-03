# GarageOS — iPhone uchun sinov va tarqatish

GarageOS Flutter xodimlar ilovasi iPhone va iPad uchun ham bitta koddan yig‘iladi. Hozirgi iOS loyiha iOS **15.0+** ni belgilagan; telefon mosligini haqiqiy qurilmada ham tekshirish kerak. Vazifa: [#8](https://github.com/Shoamirg/garageos/issues/8).

## Qaysi nusxa nima uchun?

| Nusxa | Qayerda ishlaydi | Holat |
| --- | --- | --- |
| Simulator build | Mac ichidagi virtual iPhone | Avtomatik iOS tekshiruvi uchun |
| Unsigned `Runner.app` arxivi | Kompilyatsiya dalili | Oddiy iPhone’ga o‘rnatilmaydi |
| Apple imzosi bilan IPA / TestFlight | Sheriklarning haqiqiy iPhone’i | Apple hisobi va signing sozlamalari kerak |

Windowsda Xcode yo‘q. Shu sabab native iOS build Macda yoki GitHubdagi macOS runnerda bajariladi. [Flutter iOS qo‘llanmasi](https://docs.flutter.dev/deployment/ios).

## GitHub orqali iOS tekshiruvi

`.github/workflows/flutter-ios.yml` Flutter **3.47.6** va `macos-26` runnerdan foydalanadi. `codex/service-work-demo` branchidagi iOS, ilova kodi, native test yoki paket fayllari o‘zgarganda ishlaydi. Apple kaliti yoki sertifikati kerak emas:

1. Xcode versiyasi va mavjud simulatorlar yoziladi.
2. `flutter analyze` va `flutter build ios --release --no-codesign` bajariladi.
3. Mavjud iPhone simulatorida ikkita native test bajariladi: payment-intent saqlash/o‘qish/tozalash va demo navbat → ish → hisob → qisman/to‘liq to‘lov qaydi.
4. Unsigned build arxivi GitHub Actions artifact sifatida 7 kun saqlanadi. Bu sheriklarga tarqatish fayli emas.

Workflow qo‘lda ishga tushirishni ham qo‘llaydi; GitHub `workflow_dispatch` orqali ishga tushirish uchun workflow avval default branchda ro‘yxatdan o‘tgan bo‘lishi kerak. Hozir feature branch push triggeridan foydalaniladi. Private repo runnerlari GitHub hisobidagi Actions daqiqalarini ishlatadi; limit va xarajatlar [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) bo‘yicha yuritiladi.

## Macda ishlatish

Flutter 3.47.6 va Xcode tayyor bo‘lsin. [iOS muhitini sozlash](https://docs.flutter.dev/platform-integration/ios/setup). Loyiha Flutter Swift Package Manager integratsiyasidan foydalanadi; qo‘llab-quvvatlamaydigan plugin uchun CocoaPods fallback ishlashi mumkin.

`garageos/flutter_app` ichidan:

```sh
flutter pub get
flutter devices
flutter run -d <iPhone-yoki-simulator-ID>
```

`Demo rejimni ochish` tugmasi internetsiz xodimlar jarayonini ko‘rsatadi. Demo yozuvlari ilova yopilganda yoki demo rejimdan chiqilganda tiklanadi. Bu bosqichdagi ekranlar va cheklovlar asosiy [README](../README.md)da berilgan.

Native tekshiruv:

```sh
flutter test integration_test/ios_smoke_test.dart -d <iPhone-simulator-ID>
```

## Haqiqiy API

Sherikning iPhone’idagi `127.0.0.1` o‘sha telefonning o‘zi; Windows kompyuteringizdagi API emas. Live rejim uchun telefonga ochiq, to‘g‘ri sertifikatli HTTPS API manzili kerak. Manzil `/api/v1` bilan tugasin. Uni `Ulanish sozlamalari`da yoki `--dart-define=API_URL=...` orqali kiriting. iOS tarmoq xavfsizligi cheklovlari saqlangan.

TestFlight uchun offline demo alohida ishlaydi. Bir nechta sherik bitta real ma’lumotni ko‘rishi uchun backend hosting va staff hisoblarini keyingi bosqichda ulash kerak; shu kompyuterdagi lokal backend tashqariga chiqarilmagan.

## Sheriklarga TestFlight orqali o‘rnatish

Bu bosqichda Apple Developer Program hisobi, team va signing sozlamalari hali tasdiqlanmagan. Apple paroli, `.p8`, `.p12` yoki provisioning profile faylini chatga/repo ichiga joylamang.

Hisob tayyor bo‘lgach, Macdagi Xcode / App Store Connect orqali:

1. Xcode’da `ios/Runner.xcworkspace`ni oching. `Runner` → Signing & Capabilities ichida haqiqiy teamni tanlang; bundle identifier mavjudligi va sizning hisobingizga tegishliligini tekshiring. Hozirgi identifier: `uz.garageos.garageosStaff`.
2. Apple Developer Program va App Store Connect’da mos app yozuvini tayyorlang. Ilova nomi, beta izohi, aloqa ma’lumoti, privacy va export-compliance savollari egasi tomonidan to‘ldiriladi.
3. Release icon/launch ko‘rinishi va haqiqiy iPhone’da login, klaviatura, safe area, orqaga qaytish, light/dark, hisob va qayta to‘lov urinishini tekshiring. Hozir launcher iconlar Flutter scaffoldidan qolgan.
4. `pubspec.yaml`dagi build raqamini har bir yangi yuklash uchun oshiring. `flutter build ipa --release` orqali signed archive va IPA yig‘ing.
5. Archive’ni Xcode Organizerda Validate/Distribute orqali App Store Connect’ga yuklang. TestFlight buildini ichki testda tekshiring.
6. Sheriklar tashqi tester bo‘lsa, tashqi guruh yarating. Birinchi external build Apple beta tekshiruvidan o‘tadi; tasdiqdan keyin egasi email yoki TestFlight taklif havolasini ulashadi. Sheriklar iPhone’da TestFlight orqali ilovani o‘rnatadi. [Apple tashqi testerlar qo‘llanmasi](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).

Signed IPA, jismoniy iPhone sinovi va TestFlight taklifi tayyor bo‘lmaguncha sheriklarga o‘rnatiladigan iOS versiya tayyor deb hisoblanmaydi. Simulator natijasi bu qadamlarning o‘rnini bosmaydi.
