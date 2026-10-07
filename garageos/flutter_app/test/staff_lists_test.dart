import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/main.dart';

class ListRepository extends DemoRepository {
  Completer<PageData<Customer>>? nextCustomers;
  Completer<PageData<Bill>>? nextBills;
  int customerLoads = 0;
  int workLoads = 0;
  final requests = <String>[];

  @override
  Future<PageData<Bill>> bills({String query = '', int page = 1}) {
    final pending = nextBills;
    nextBills = null;
    if (pending != null) return pending.future;
    return Future.value(
      PageData(
        List.generate(
          20,
          (i) => Bill.fromJson({
            'id': 'invoice-$i',
            'code': 'INV-${i.toString().padLeft(2, '0')}',
            'customer_id': 'list-$i',
            'customer_name': 'Sinov mijoz $i',
            'currency': 'UZS',
            'status': 'issued',
            'total': 100000,
            'amount_paid': 0,
            'balance': 100000,
            'subtotal': 100000,
            'tax_total': 0,
            'discount_total': 0,
          }),
        ),
        20,
        page,
      ),
    );
  }

  @override
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
  }) {
    workLoads++;
    return super.works(query: query, page: page, date: date, status: status);
  }

  @override
  Future<PageData<Customer>> customers({String query = '', int page = 1}) {
    customerLoads++;
    requests.add(query);
    final pending = nextCustomers;
    nextCustomers = null;
    if (pending != null) return pending.future;
    final all = List.generate(
      30,
      (i) => Customer(
        'list-$i',
        'Mijoz ${i.toString().padLeft(2, '0')}',
        '+998901234567',
      ),
    ).where((c) => c.name.toLowerCase().contains(query.toLowerCase())).toList();
    return Future.value(PageData(all, all.length, page));
  }
}

Future<AppState> openStaff(WidgetTester tester, ListRepository repo) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final state = AppState()
    ..repository = repo
    ..name = 'Sinov xodim'
    ..garageName = 'Turon avtoservis'
    ..themeMode = ThemeMode.light;
  addTearDown(state.dispose);
  await tester.pumpWidget(GarageApp(state: state));
  await tester.pumpAndSettle();
  return state;
}

Future<void> tab(WidgetTester tester, String label) async {
  await tester.tap(
    find.descendant(of: find.byType(NavigationBar), matching: find.text(label)),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'invoices retain their header and scroll during refresh and recover from an error',
    (tester) async {
      final repo = ListRepository();
      await openStaff(tester, repo);
      await tab(tester, 'Hisoblar');
      final scroll = find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      );
      await tester.scrollUntilVisible(
        find.text('INV-12'),
        400,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      final offset = tester.state<ScrollableState>(scroll).position.pixels;
      expect(offset, greaterThan(600));
      await tab(tester, 'Navbat');
      final pending = Completer<PageData<Bill>>();
      repo.nextBills = pending;
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Hisoblar'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      pending.completeError(const AppFailure('Sinov hisob xatosi.'));
      await tester.pumpAndSettle();
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      await tab(tester, 'Navbat');
      await tab(tester, 'Hisoblar');
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      await tester.scrollUntilVisible(
        find.byTooltip('Yangilash'),
        -400,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      final failure = Completer<PageData<Bill>>();
      tester.state<ScrollableState>(scroll).position.jumpTo(0);
      await tester.pumpAndSettle();
      repo.nextBills = failure;
      await tester.tap(find.byTooltip('Yangilash'));
      await tester.pump();
      expect(find.text('Hisoblar'), findsNWidgets(2));
      failure.completeError(const AppFailure('Sinov hisob xatosi.'));
      await tester.pumpAndSettle();
      expect(find.text('Hisoblar'), findsNWidgets(2));
      expect(find.text('Qayta urinish'), findsOneWidget);
      await tester.tap(find.text('Qayta urinish'));
      await tester.pumpAndSettle();
      expect(find.text('Sinov hisob xatosi.'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'appointment search and status survive tab navigation; clear restores all dates',
    (tester) async {
      final repo = ListRepository();
      await openStaff(tester, repo);
      await tester.enterText(find.byType(TextField), 'Aziz');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('1 ta navbat topildi'), findsOneWidget);
      final confirmed = find.widgetWithText(ChoiceChip, 'Tasdiqlangan');
      await tester.scrollUntilVisible(
        confirmed,
        160,
        scrollable: find.descendant(
          of: find.byWidgetPredicate(
            (w) => w is ListView && w.scrollDirection == Axis.horizontal,
          ),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.ensureVisible(confirmed);
      await tester.pumpAndSettle();
      await tester.tap(confirmed);
      await tester.pumpAndSettle();
      expect(find.text('Navbat yoʻq'), findsOneWidget);
      await tab(tester, 'Mijozlar');
      await tab(tester, 'Navbat');
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Aziz',
      );
      expect(tester.widget<ChoiceChip>(confirmed).selected, isTrue);
      final clear = find.widgetWithText(OutlinedButton, 'Filtrlarni tozalash');
      await tester.ensureVisible(clear);
      await tester.pumpAndSettle();
      await tester.tap(clear);
      await tester.pumpAndSettle();
      expect(find.text('3 ta navbat topildi'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(
        tester
            .widget<SegmentedButton<bool>>(find.byType(SegmentedButton<bool>))
            .selected,
        {false},
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a late older search response does not replace the current result',
    (tester) async {
      final repo = ListRepository();
      await openStaff(tester, repo);
      await tab(tester, 'Mijozlar');
      final older = Completer<PageData<Customer>>();
      repo.nextCustomers = older;
      await tester.enterText(find.byType(TextField), 'Mijoz 11');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'Mijoz 12');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Mijoz 12'), findsWidgets);
      older.complete(
        const PageData([Customer('old', 'Mijoz 11', '+998901234567')], 1, 1),
      );
      await tester.pumpAndSettle();
      expect(find.text('Mijoz 11'), findsNothing);
      expect(find.text('Mijoz 12'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'search survives tab changes; tabs load lazily and theme does not refetch',
    (tester) async {
      final repo = ListRepository();
      final state = await openStaff(tester, repo);
      expect(repo.customerLoads, 0);
      expect(repo.workLoads, 1);
      await tab(tester, 'Mijozlar');
      await tester.enterText(find.byType(TextField), 'Mijoz 12');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('1 ta mijoz topildi'), findsOneWidget);
      expect(find.text('Mijoz 12'), findsWidgets);
      final loads = repo.customerLoads;
      state.toggleTheme(Brightness.light);
      await tester.pumpAndSettle();
      expect(repo.customerLoads, loads);
      expect(repo.workLoads, 1);
      await state.setLocale(const Locale('en'));
      await tester.pumpAndSettle();
      expect(find.text('1 customer found'), findsOneWidget);
      expect(find.text('Mijoz 12'), findsWidgets);
      expect(repo.customerLoads, loads);
      expect(repo.workLoads, 1);
      await state.setLocale(const Locale('uz'));
      await tester.pumpAndSettle();
      final customerFocus = FocusManager.instance.primaryFocus!;
      await tab(tester, 'Navbat');
      expect(customerFocus.hasFocus, isFalse);
      await tab(tester, 'Mijozlar');
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Mijoz 12',
      );
      expect(find.text('1 ta mijoz topildi'), findsOneWidget);
      expect(repo.customerLoads, loads + 1);
      await tester.tap(find.byTooltip('Qidiruvni tozalash'));
      await tester.pumpAndSettle();
      expect(find.text('30 ta mijoz topildi'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'refresh retains a long list scroll position while requests are pending',
    (tester) async {
      final repo = ListRepository();
      await openStaff(tester, repo);
      await tab(tester, 'Mijozlar');
      final scroll = find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      );
      await tester.scrollUntilVisible(
        find.text('Mijoz 12'),
        300,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      final position = tester.state<ScrollableState>(scroll).position;
      final offset = position.pixels;
      expect(offset, greaterThan(600));
      await tab(tester, 'Navbat');
      final pending = Completer<PageData<Customer>>();
      repo.nextCustomers = pending;
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Mijozlar'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(position.pixels, closeTo(offset, 1));
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      pending.complete(await repo.customers());
      await tester.pumpAndSettle();
      expect(position.pixels, closeTo(offset, 1));
      await tab(tester, 'Navbat');
      final failure = Completer<PageData<Customer>>();
      repo.nextCustomers = failure;
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Mijozlar'),
        ),
      );
      await tester.pump();
      failure.completeError(const AppFailure('Sinov yangilash xatosi.'));
      await tester.pumpAndSettle();
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      await tab(tester, 'Navbat');
      await tab(tester, 'Mijozlar');
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'pending search keeps controls; failed search can be cleared and empty results recovered',
    (tester) async {
      final repo = ListRepository();
      await openStaff(tester, repo);
      await tab(tester, 'Mijozlar');
      final pending = Completer<PageData<Customer>>();
      repo.nextCustomers = pending;
      await tester.enterText(find.byType(TextField), 'yoq');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Yangi mijoz'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      pending.completeError(const AppFailure('Sinov ulanish xatosi.'));
      await tester.pumpAndSettle();
      expect(find.text('Sinov ulanish xatosi.'), findsOneWidget);
      expect(find.text('Qayta urinish'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      await tester.tap(find.byTooltip('Qidiruvni tozalash'));
      await tester.pumpAndSettle();
      expect(find.text('30 ta mijoz topildi'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'yoq');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Mijoz topilmadi'), findsOneWidget);
      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Qidiruvni tozalash'),
      );
      await tester.pumpAndSettle();
      expect(find.text('30 ta mijoz topildi'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
