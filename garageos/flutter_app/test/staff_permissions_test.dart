import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/domain/models.dart';

import 'support/dock.dart';

class ReadOnlyRepository extends DemoRepository {
  @override
  bool get canWrite => false;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'read-only staff can inspect work without intake or lifecycle actions',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final state = AppState()..repository = ReadOnlyRepository();
      addTearDown(state.dispose);
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      expect(find.text('Yangi navbat'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Aziz Karimov'),
        160,
        scrollable: find.byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        ),
      );
      await tester.ensureVisible(find.text('Aziz Karimov'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aziz Karimov'));
      await tester.pumpAndSettle();
      expect(find.text('Navbatni tasdiqlash'), findsNothing);
      expect(find.text('Navbatni bekor qilish'), findsNothing);
      expect(find.text('Ustani almashtirish'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'read-only customer and linked invoice retain reading without write actions',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repo = ReadOnlyRepository();
      await repo.createBill(await repo.work('w3'), [
        BillLine('Diagnostika', 1, const Money(10000000)),
      ], 0);
      final state = AppState()..repository = repo;
      addTearDown(state.dispose);
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      await tester.tap(dockTab('Mijozlar'));
      await tester.pumpAndSettle();
      expect(find.text('Yangi mijoz'), findsNothing);
      await tester.tap(find.text('Aziz Karimov'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Chevrolet Cobalt'),
        200,
        scrollable: find.byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        ).last,
      );
      expect(find.text('Mashina qoʻshish'), findsNothing);
      expect(find.text('Navbat yaratish'), findsNothing);
      expect(find.text('Chevrolet Cobalt'), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      await tester.tap(dockTab('Ishlar'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Bekzod Aliyev'),
        160,
        scrollable: find.byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        ),
      );
      await tester.ensureVisible(find.text('Bekzod Aliyev'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bekzod Aliyev'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hisobni ochish'));
      await tester.pumpAndSettle();
      expect(find.text('Toʻlov yozish / tekshirish'), findsNothing);
      await tester.tap(find.byTooltip('Mijozga koʻrsatish'));
      await tester.pumpAndSettle();
      expect(find.text('Mijoz uchun hisob'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final entry in {
    'uz': 'Faqat ko‘rish huquqi · o‘zgartirish uchun admin yoki qabul xodimiga murojaat qiling.',
    'en': 'Read-only access · contact an admin or reception staff to make changes.',
    'ru': 'Только просмотр · для изменений обратитесь к администратору или сотруднику приёмки.',
  }.entries) {
    testWidgets(
      '${entry.key}: read-only access is explained in the selected language',
      (tester) async {
        final state = AppState()
          ..repository = ReadOnlyRepository()
          ..locale = Locale(entry.key);
        addTearDown(state.dispose);
        await tester.pumpWidget(GarageApp(state: state));
        await tester.pumpAndSettle();
        expect(find.text(entry.value), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
