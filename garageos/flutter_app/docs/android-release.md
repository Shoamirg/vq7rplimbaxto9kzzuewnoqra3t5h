# GarageOS Android relizi

Application ID `uz.garageos.garageos_staff` saqlanadi. Mavjud production keystore
bo'lsa undan foydalaning: ID va sertifikat odatiy Android update uchun mos
kelishi kerak. Boshqa imzoli APKni eski debug ilovaga update qilib bo'lmaydi.
Uninstall qurilmadagi kutilayotgan to'lov so'rovlarini yo'qotishi mumkin; avval
ularni hal qiling. Source/QA build actual mijoz release/device acceptance emas.

## Private signing

Keystore va parollar Git, chat yoki CI artifactida bo'lmaydi. Kalit egasi
alohida xavfsiz backup saqlaydi; mavjud owner identity o'zicha almashtirilmaydi.
Relizda quyidagi to'rtta muhit o'zgaruvchisining barchasi kerak:

| O'zgaruvchi | Qiymat |
| --- | --- |
| `GARAGEOS_ANDROID_KEYSTORE` | Private keystore faylining to'liq yo'li |
| `GARAGEOS_ANDROID_STORE_PASSWORD` | Keystore paroli |
| `GARAGEOS_ANDROID_KEY_ALIAS` | Mavjud private key alias |
| `GARAGEOS_ANDROID_KEY_PASSWORD` | Private key paroli |

Parollarni terminal tarixiga yozmang; private operator muhiti/credential manager
orqali child processga bering. Bitta qiymat berilsa hammasi talab qilinadi.

Muqobil: to'rtta signing o'zgaruvchini bermasdan,
`GARAGEOS_ANDROID_SIGNING_PROPERTIES` bilan repo tashqarisidagi Java properties
faylini ko'rsating. Maydonlar `storeFile`, `storePassword`, `keyAlias`,
`keyPassword`. Windows yo'lida `/` ishlating; Java properties encoding/escaping
qoidalari amal qiladi. Standart ignored `android/key.properties` ham qo'llanadi.
Yo'q/noto'liq/noto'g'ri signing, expired yoki Android Debug sertifikati relizni
to'xtatadi. Oddiy debug build owner kalitini talab qilmaydi.

## API va build

Telefondan ochiladigan, ishonchli sertifikatli HTTPS API kerak. Android relizga
bitta aniq `API_URL` beriladi: `/api/v1`, credentials/query/fragment yo'q;
loopback/emulator hostlari rad etiladi. Build DNS/TLS yoki mijoz serverini
tekshirmaydi. Android release API client ham HTTP va redirectlarni rad etadi:
manifest siyosatini Dart soketlari uchun yagona kafolat deb olmaymiz.
Debug/web/iOS/offline development xatti-harakati saqlanadi.

`qa.garageos.example` faqat sintetik QA manzili, ishlaydigan mijoz serveri emas.
Production nusxaga haqiqiy endpointni bering. `pubspec.yaml` versiyani belgilaydi;
operator `--build-name`/`--build-number` ham bera oladi. Tarqatilgan nusxalardan
yuqori raqam tanlang: historical debug0.1.2+3, source baseline0.1.1+2. Split APK
versionCode ABIga qarab o'zgaradi; universal/AABni ham alohida tekshiring.

Flutter3.47.6, Android SDK36/build-tools36.0.0 va mos JDK bilan, `flutter_app/`dan:

```powershell
# Signing private child-process muhitida oldindan sozlangan bo'lsin.
flutter build apk --release --split-per-abi --dart-define=API_URL=https://YOUR-HOST/api/v1 --build-name=0.1.3 --build-number=4
```

Endpoint va raqamlar operator tanlaydigan qiymatlar. APKlar
`build/app/outputs/flutter-apk/app-<abi>-release.apk`da; telefon ABIiga mosini
tanlang. Play Store uchun owner/upload key va store setup bilan appbundle
tayyorlanadi; store publication bu ishda bajarilmaydi.

`apksigner verify --print-certs`da signer SHA256ini kutilgan owner sertifikati
bilan solishtiring. `apkanalyzer manifest print`da ID/versiya/INTERNET,
debuggable=false va tarmoq siyosatini tekshiring. Artifact SHA256i, hajmi, source
commit va endpointni release receiptga yozing. Build xatosidan so'ng eski
`build/` faylini yangi reliz deb olmang.

## Jenkins QA

`scripts/test_android_release.py` actual Flutter/Gradle va Android tools orqali
missing/invalid signing/API, uchta signed split APK va debug buildni tekshiradi.
Vaqtinchalik QA kaliti repo va evidence katalogidan tashqarida yaratiladi;
keyin o'chiriladi. Faqat markerli alohida QA Gradle home daemoni to'xtatiladi;
umumiy `.gradle` yoki boshqa loyiha cache'ini bermang.

`QA-ONLY-*` APKlar va `android-release-summary.json` imzo/manifest/ABI/hash/hajm
dalilidir. Har run boshqa throwaway sertifikat ishlatadi. **Mijozga tarqatmang**:
ular owner relizi emas, endpoint sintetik, telefonda o'rnatish sinovi yo'q.
Jenkins Android SDKni `GARAGEOS_ANDROID_SDK`, JDKni
`GARAGEOS_ANDROID_JAVA_HOME` orqali almashtira oladi; default shu PCning SDK36
va private Temurin21 runtime'idir.

Owner signing/backup, client HTTPS API, physical Android/iPhone, account/work/
invoice/payment/restart/network sinovlari va avtoservis piloti #10 da qoladi.

Primary: [Flutter release](https://docs.flutter.dev/deployment/android),
[Android signing](https://developer.android.com/studio/publish/app-signing),
[Flutter socket policy](https://docs.flutter.dev/release/breaking-changes/network-policy-ios-android).
