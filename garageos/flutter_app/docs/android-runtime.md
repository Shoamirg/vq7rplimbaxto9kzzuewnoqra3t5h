# Android native QA

Bu tekshiruv #23 dagi emulyator tayyorgarligi uchun. Haqiqiy telefon, mijoz
HTTPS serveri, owner signing va avtoservis piloti #10 da alohida qoladi.

## Alohida virtual telefon

Rasmiy SDK emulator va `system-images;android-35;google_apis;x86_64` paketi kerak.
`emulator -accel-check` virtualizatsiyani tekshiradi; Windowsda WHPX ishlashi
kerak. OS sozlamalari/reboot talab qilinsa buni operator bajaradi. Mavjud user
AVDni reset/uninstall qilmang: yangi QA AVDni repo tashqarisidagi alohida
`ANDROID_AVD_HOME`da yarating. `avdmanager create avd -n NAME -k PACKAGE -p PATH
-d pixel_6` ishlatilishi mumkin; nom/path mavjud bo'lsa overwrite qilmang.

Bo'sh console/ADB port juftligini tanlang, masalan 5580/5581. Emulyatorni
`-avd NAME -port 5580 -no-window -no-snapshot -no-audio -gpu swiftshader` bilan
ochish mumkin. Windows background launcher `-WindowStyle Hidden` ishlatsin.
PID, executable/start time va serialni yozib oling. `adb -s emulator-5580 shell
getprop sys.boot_completed` 1 bo'lishini kuting; barcha keyingi ADB buyruqlarida
aynan shu serialni bering. Mavjud telefon yoki boshqa emulator tanlanmasin.

## Native integration

Flutter3.47.6, SDK36/build-tools36.0.0 va private JDK21 bilan `flutter_app/`dan:

```powershell
flutter test integration_test/android_smoke_test.dart -d emulator-5580 --reporter expanded
```

Android va iOS wrapperlari `native_smoke.dart`dagi bir xil jarayonni chaqiradi.
Platform assertion haqiqiy targetni tekshiradi. Til tanlovi yangi Flutter app
sessiyasida saqlanadi; payment intent native preferences orqali qayta ochilib,
boshqa scope'dan o'qilmaydi; demo real roster ustasi → ish → bitta hisob →
qisman/to'liq to'lov jarayonini bajaradi. Bu debug integration; app sessiyasini
qayta yaratish OS process restart emas. iOS wrapper uchun Mac/Xcode sinovi
alohida kerak.

## Oddiy release APK

Faqat shu alohida QA AVDda [Android release guide](android-release.md) bo'yicha
actual signed QA APKni o'rnating. Source SHA, artifact SHA256, signer sertifikati,
ID/versiya/ABI, emulator/system-image versiyalari va API levelni yozing. Debug
test APK va QA release imzolari farq qilsa faqat shu QA AVDdagi test ilovasini
uninstall qilish mumkin; mijoz telefonida kutilayotgan to'lov ma'lumotlarini
o'chirmang.

UZ/EN/RU login va ulanish sozlamalarini tekshiring. Soxta HTTP API kiritib
release HTTPS xatosi tanlangan tilda chiqishini tekshiring; haqiqiy credential
kiritmang. Ikonlar, configured fontlar va API maydonining floating labeli to'liq
ko'rinsin. Oddiy release start, native screenshot/log va force-stop/reopen til
saqlanishini qayd eting. Bu HTTPS serverga muvaffaqiyatli login, redirect yoki
real tarmoq uzilishi sinovi o'rnini bosmaydi. Integration test uchun policy flag
berish ham oddiy release APKni tekshirish o'rnini bosmaydi.

Dalillar repo tashqarisida saqlansin. `QA-ONLY` APKlarni mijozga tarqatmang.
Yakunida aynan o'z serialining AVD nomini tekshirib `adb -s SERIAL emu kill`
bilan to'xtating; PID/start-time va portlar bo'shligini tekshiring. Shared ADB
serverini, boshqa AVD yoki umumiy Gradle cache'ini to'xtatmang/tozalamang.

Primary: [Android emulator](https://developer.android.com/studio/run/emulator-commandline),
[acceleration](https://developer.android.com/studio/run/emulator-acceleration),
[Flutter integration testing](https://docs.flutter.dev/testing/integration-tests).
