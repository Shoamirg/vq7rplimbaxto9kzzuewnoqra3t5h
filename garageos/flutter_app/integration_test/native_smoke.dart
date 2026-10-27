import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:garageos_staff/data/payment_store.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/main.dart' as app;
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';

void runNativeSmokeTests(TargetPlatform platform, String device) {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('$device language preference survives a new app session', (
    tester,
  ) async {
    expect(defaultTargetPlatform, platform);
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove('garageos.language');
    try {
      app.main();
      await tester.pumpAndSettle();
      // Welcome's UZ | RU | EN pill picker.
      await tester.tap(find.text('RU'));
      await tester.pumpAndSettle();
      expect(find.text('Сервис вашего авто — с одного взгляда.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      app.main();
      await tester.pumpAndSettle();
      expect(find.text('Сервис вашего авто — с одного взгляда.'), findsOneWidget);
    } finally {
      await preferences.remove('garageos.language');
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets('$device native payment intent survives store recreation', (
    tester,
  ) async {
    expect(defaultTargetPlatform, platform);
    final scope = 'native-test/${const Uuid().v4()}';
    const invoice = 'synthetic-invoice';
    final original = DevicePaymentStore(scope);
    final intent = PendingPayment(
      const Money(10000000),
      'cash',
      const Uuid().v4(),
    );
    try {
      await original.write(invoice, intent);
      final restored = await DevicePaymentStore(scope).read(invoice);
      expect(restored?.key, intent.key);
      expect(restored?.amount.cents, 10000000);
      expect(restored?.method, 'cash');
      expect(
        await DevicePaymentStore('$scope/other-user').read(invoice),
        isNull,
      );
      await DevicePaymentStore(scope).clear(invoice);
      expect(await original.read(invoice), isNull);
    } finally {
      await original.clear(invoice);
    }
  });

  testWidgets('$device demo: assigned work, one invoice and split payments', (
    tester,
  ) async {
    expect(defaultTargetPlatform, platform);
    app.main();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Xodim sifatida kirish'));
    await tester.tap(find.text('Xodim sifatida kirish'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Demo rejimni ochish'));
    await tester.tap(find.text('Demo rejimni ochish'));
    await tester.pumpAndSettle();
    expect(find.text('Demo maʼlumotlar · chiqishda tiklanadi'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Aziz Karimov'),
      180,
      scrollable: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable && widget.axisDirection == AxisDirection.down,
      ),
    );
    await tester.tap(find.text('Aziz Karimov'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Navbatni tasdiqlash'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Usta tayinlash').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('sherzod@example.com'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ishni boshlash'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ishni tugatish'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Diagnostika');
    await tester.enterText(find.byType(TextFormField).at(1), 'Native sinovi');
    await tester.tap(find.text('Ish tugadi'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hisob yaratish'));
    await tester.pumpAndSettle();
    final price = find.byType(TextFormField).at(2);
    await tester.ensureVisible(price);
    await tester.enterText(price, '300000');
    await tester.pumpAndSettle();
    final saveInvoice = find.widgetWithText(FilledButton, 'Mijozga yuborish');
    await tester.tap(saveInvoice);
    await tester.pumpAndSettle();
    expect(find.text('300 000 soʻm'), findsWidgets);
    await tester.tap(find.byTooltip('Mijozga koʻrsatish'));
    await tester.pumpAndSettle();
    expect(find.text('Mijoz uchun hisob'), findsOneWidget);
    expect(find.text('Toʻlov yozish / tekshirish'), findsNothing);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Toʻlov yozish / tekshirish'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '100000');
    await tester.pumpAndSettle();
    final savePayment = find.widgetWithText(
      FilledButton,
      'Toʻlovni qayd etish',
    );
    await tester.tap(savePayment);
    await tester.pumpAndSettle();
    // Receipt state: amber partly paid, then back to the invoice.
    expect(find.text('Qisman toʻlangan'), findsOneWidget);
    await tester.tap(find.text('Tayyor'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Toʻlov yozish / tekshirish'));
    await tester.pumpAndSettle();
    await tester.tap(savePayment);
    await tester.pumpAndSettle();
    expect(find.text('Toʻlangan'), findsWidgets);
    await tester.tap(find.text('Tayyor'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hisobni ochish'));
    await tester.pumpAndSettle();
    expect(find.text('300 000 soʻm'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
