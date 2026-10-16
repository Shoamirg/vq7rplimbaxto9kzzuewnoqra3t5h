import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fonts.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  const translations = {
    'Demo rejimni ochish': ['Open demo', 'Открыть демо'],
    'Demo maʼlumotlar · chiqishda tiklanadi': [
      'Demo data · resets on sign-out',
      'Демо-данные · сброс при выходе',
    ],
    'Navbatni tasdiqlash': ['Confirm appointment', 'Подтвердить запись'],
    'Usta tayinlash': ['Assign mechanic', 'Назначить механика'],
    'Ishni boshlash': ['Start work', 'Начать работу'],
    'Ishni tugatish': ['Complete work', 'Завершить работу'],
    'Ish tugadi': ['Work completed', 'Работа завершена'],
    'Hisob yaratish': ['Create invoice', 'Создать счёт'],
    '300 000 soʻm': ['300,000 UZS', '300 000 сум'],
    'Mijozga koʻrsatish': ['Show to customer', 'Показать клиенту'],
    'Mijoz uchun hisob': ['Customer invoice', 'Счёт для клиента'],
    'Toʻlov yozish / tekshirish': [
      'Record / check payment',
      'Записать / проверить платёж',
    ],
    'Toʻlovni qayd etish': ['Record payment', 'Записать платёж'],
    'Qisman toʻlangan': ['Partially paid', 'Частично оплачен'],
    'Toʻlangan': ['Paid', 'Оплачен'],
    'Hisobni ochish': ['Open invoice', 'Открыть счёт'],
  };
  for (final language in ['uz', 'en', 'ru']) {
    String label(String uz) =>
        language == 'uz' ? uz : translations[uz]![language == 'en' ? 0 : 1];
    testWidgets(
      '$language 360dp at 130% text: one invoice and split payments',
      (tester) async {
        tester.view.physicalSize = const Size(360, 800);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await tester.pumpWidget(const GarageApp());
        await tester.pumpAndSettle();
        if (language != 'uz') {
          await tester.tap(find.byKey(const ValueKey('language-menu')));
          await tester.pumpAndSettle();
          await tester.tap(find.text(language == 'en' ? 'English' : 'Русский'));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text(label('Demo rejimni ochish')));
        await tester.pumpAndSettle();
        expect(
          find.text(label('Demo maʼlumotlar · chiqishda tiklanadi')),
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
        await tester.tap(find.text(label('Navbatni tasdiqlash')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Usta tayinlash')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('sherzod@example.com'));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Ishni boshlash')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Ishni tugatish')));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField).at(0), 'Diagnostika');
        await tester.enterText(find.byType(TextFormField).at(1), 'Tekshirildi');
        await tester.tap(find.text(label('Ish tugadi')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Hisob yaratish')));
        await tester.pumpAndSettle();
        final price = find.byType(TextFormField).at(2);
        await tester.ensureVisible(price);
        await tester.enterText(price, '300000');
        await tester.tap(
          find.widgetWithText(FilledButton, label('Hisob yaratish')),
        );
        await tester.pumpAndSettle();
        expect(find.text(label('300 000 soʻm')), findsWidgets);
        await tester.tap(find.byTooltip(label('Mijozga koʻrsatish')));
        await tester.pumpAndSettle();
        expect(find.text(label('Mijoz uchun hisob')), findsOneWidget);
        expect(find.text(label('Toʻlov yozish / tekshirish')), findsNothing);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Toʻlov yozish / tekshirish')));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField), '100000');
        await tester.tap(
          find.widgetWithText(FilledButton, label('Toʻlovni qayd etish')),
        );
        await tester.pumpAndSettle();
        expect(find.text(label('Qisman toʻlangan')), findsOneWidget);
        await tester.tap(find.text(label('Toʻlov yozish / tekshirish')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(FilledButton, label('Toʻlovni qayd etish')),
        );
        await tester.pumpAndSettle();
        expect(find.text(label('Toʻlangan')), findsWidgets);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label('Hisobni ochish')));
        await tester.pumpAndSettle();
        expect(find.text(label('300 000 soʻm')), findsWidgets);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
