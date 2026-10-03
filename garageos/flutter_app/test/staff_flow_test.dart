import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('Golos Text')
      ..addFont(rootBundle.load('assets/fonts/GolosText.ttf'));
    await loader.load();
  });
  testWidgets(
    '360dp at 130% text: demo from assigned work to one invoice and split payments',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(const GarageApp());
      await tester.pumpAndSettle();
      await tester.tap(find.text('Demo rejimni ochish'));
      await tester.pumpAndSettle();
      expect(
        find.text('Demo maʼlumotlar · chiqishda tiklanadi'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Aziz Karimov'),
        180,
        scrollable: find.byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aziz Karimov'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Navbatni tasdiqlash'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Usta tayinlash'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), 'Sherzod Rahimov');
      await tester.tap(find.text('Tayinlash'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ishni boshlash'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ishni tugatish'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).at(0), 'Diagnostika');
      await tester.enterText(find.byType(TextFormField).at(1), 'Tekshirildi');
      await tester.tap(find.text('Ish tugadi'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hisob yaratish'));
      await tester.pumpAndSettle();
      final price = find.byType(TextFormField).at(2);
      await tester.ensureVisible(price);
      await tester.enterText(price, '300000');
      await tester.tap(find.widgetWithText(FilledButton, 'Hisob yaratish'));
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
      await tester.tap(
        find.widgetWithText(FilledButton, 'Toʻlovni qayd etish'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Qisman toʻlangan'), findsOneWidget);
      await tester.tap(find.text('Toʻlov yozish / tekshirish'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Toʻlovni qayd etish'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Toʻlangan'), findsWidgets);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hisobni ochish'));
      await tester.pumpAndSettle();
      expect(find.text('300 000 soʻm'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
}
