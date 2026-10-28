import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/design/bento.dart';
import 'package:garageos_staff/design/theme.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/ui/billing.dart';

import 'support/dock.dart';
import 'support/fonts.dart';

Map<String, dynamic> document(int index) => {
  'id': 'invoice-$index',
  'code': 'INV-$index',
  'customer_id': 'customer-$index',
  'customer_name': 'Mijoz $index',
  'vehicle_label': 'Cobalt 01A${index}BC',
  'currency': 'UZS',
  'status': 'issued',
  'total': 100000,
  'amount_paid': 0,
  'balance': 100000,
  'subtotal': 100000,
  'tax_total': 0,
  'discount_total': 0,
  'line_items': [],
  'payments': [],
};

class HistoryServer {
  final requests = <Uri>[];
  Completer<http.Response>? pending;
  bool fail = false;
  http.Response json(Object data, [int status = 200]) => http.Response(
    jsonEncode(data),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
  Future<http.Response> respond(http.Request request) async {
    final uri = request.url;
    if (uri.path.endsWith('/appointments')) {
      return json({'items': [], 'total': 0});
    }
    if (!uri.path.endsWith('/invoices')) {
      return json(document(int.parse(uri.path.split('-').last)));
    }
    requests.add(uri);
    final delayed = pending;
    pending = null;
    if (delayed != null) return delayed.future;
    if (fail) {
      return json({
        'error': {'message': 'History unavailable'},
      }, 503);
    }
    final q = (uri.queryParameters['q'] ?? '').toLowerCase();
    final page = int.parse(uri.queryParameters['page'] ?? '1');
    final size = int.parse(uri.queryParameters['page_size'] ?? '80');
    final all = List.generate(85, (i) => document(85 - i))
        .where(
          (bill) => [
            'code',
            'customer_name',
            'vehicle_label',
          ].any((key) => (bill[key] as String).toLowerCase().contains(q)),
        )
        .toList();
    return json({
      'items': all.skip((page - 1) * size).take(size).toList(),
      'total': all.length,
      'page': page,
      'page_size': size,
      'total_pages': (all.length / size).ceil(),
    });
  }
}

final scroll = find.byWidgetPredicate(
  (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
);

Future<AppState> openHistory(WidgetTester tester, HistoryServer server) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final state = AppState()
    ..repository = LiveRepository(
      ApiClient(
        'http://localhost:8010/api/v1',
        client: MockClient(server.respond),
      ),
    )
    ..name = 'Xodim'
    ..garageName = 'Avtoservis'
    ..themeMode = ThemeMode.light;
  addTearDown(state.dispose);
  await tester.pumpWidget(
    RepaintBoundary(
      key: const ValueKey('invoice-preview'),
      child: GarageApp(state: state),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(dockTab('Hisoblar'));
  await tester.pumpAndSettle();
  return state;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'invoice history pages on the server, finds old invoices and clears an empty search',
    (tester) async {
      final server = HistoryServer();
      await openHistory(tester, server);
      expect(server.requests.last.queryParameters['page_size'], '30');
      expect(server.requests.last.queryParameters['view'], 'awaiting');
      expect(find.text('85 ta hisob topildi'), findsOneWidget);
      // Scrolling past the first page loads the next one.
      await tester.scrollUntilVisible(
        find.text('INV-55'),
        400,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '2');
      expect(find.text('INV-55'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byType(TextField),
        -1200,
        scrollable: scroll,
      );
      await tester.enterText(find.byType(TextField), 'inv-1');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '1');
      expect(server.requests.last.queryParameters['q'], 'inv-1');
      expect(find.text('11 ta hisob topildi'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'missing invoice');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Mos hisob topilmadi'), findsOneWidget);
      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Qidiruvni tozalash'),
      );
      await tester.pumpAndSettle();
      expect(find.text('85 ta hisob topildi'), findsOneWidget);
      expect(server.requests.last.queryParameters['q'], '');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'invoice query, page and scroll survive tabs, detail return and language change',
    (tester) async {
      final server = HistoryServer();
      final state = await openHistory(tester, server);
      await tester.enterText(find.byType(TextField), 'INV-');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('INV-45'),
        400,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      final offset = tester.state<ScrollableState>(scroll).position.pixels;
      await tester.tap(dockTab('Ishlar'));
      await tester.pumpAndSettle();
      await tester.tap(dockTab('Hisoblar'));
      await tester.pumpAndSettle();
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(offset, 1),
      );
      // Returning reloads every page the reader had loaded.
      expect(server.requests.last.queryParameters['q'], 'INV-');
      expect(server.requests.last.queryParameters['page'], '2');
      await Scrollable.ensureVisible(
        tester.element(find.text('INV-45')),
        alignment: .5,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('INV-45'));
      await tester.pumpAndSettle();
      expect(find.byType(BillScreen), findsOneWidget);
      Navigator.of(tester.element(find.byType(BillScreen))).pop();
      await tester.pumpAndSettle();
      final detailOffset = tester
          .state<ScrollableState>(scroll)
          .position
          .pixels;
      final loads = server.requests.length;
      await state.setLocale(const Locale('en'));
      await tester.pumpAndSettle();
      expect(server.requests.length, loads);
      expect(
        tester.state<ScrollableState>(scroll).position.pixels,
        closeTo(detailOffset, 1),
      );
      tester.state<ScrollableState>(scroll).position.jumpTo(0);
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'INV-',
      );
      expect(find.text('85 invoices found'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'late invoice response is ignored and a failed search retries its current query',
    (tester) async {
      final server = HistoryServer();
      await openHistory(tester, server);
      final older = Completer<http.Response>();
      server.pending = older;
      await tester.enterText(find.byType(TextField), 'INV-84');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      expect(find.text('Hisoblar yuklanmoqda…'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'INV-85');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      older.complete(
        server.json({
          'items': [document(84)],
          'total': 1,
          'page': 1,
          'page_size': 30,
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('INV-84'), findsNothing);
      expect(
        find.byWidgetPredicate((w) => w is Text && w.data == 'INV-85'),
        findsOneWidget,
      );
      server.fail = true;
      await tester.enterText(find.byType(TextField), 'Mijoz 3');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Hisoblarni yuklab bo‘lmadi'), findsOneWidget);
      server.fail = false;
      await tester.tap(find.text('Qayta urinish'));
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['q'], 'Mijoz 3');
      expect(find.text('11 ta hisob topildi'), findsOneWidget);
      expect(find.text('INV-85'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'demo searches and pages its entire in-memory invoice history',
    () async {
      final repo = DemoRepository();
      final seeded = (await repo.bills()).total;
      final bills = <Bill>[];
      for (var i = 0; i < 85; i++) {
        final work = await repo.createWork({
          'customer_id': 'c1',
          'vehicle_id': 'v1',
          'appointment_date': dateKey(
            DateTime(2020, 1, 1).add(Duration(days: i)),
          ),
          'appointment_time': '09:00',
          'estimated_duration_minutes': 60,
          'mechanic_name': 'Usta',
        });
        await repo.changeWork(work.id, 'confirm');
        await repo.changeWork(work.id, 'start');
        final done = await repo.changeWork(work.id, 'complete');
        bills.add(
          await repo.createBill(done, [
            BillLine('Xizmat', 1, const Money(10000)),
          ], 0),
        );
      }
      final total = 85 + seeded;
      final pages = [
        for (var i = 1; i <= (total / 30).ceil(); i++) await repo.bills(page: i),
      ];
      expect(pages.first.total, total);
      expect(pages.expand((p) => p.items).map((b) => b.id).toSet().length, total);
      // Newest first: the first created invoice follows the 84 newer ones.
      expect(pages.expand((p) => p.items).elementAt(84).id, bills.first.id);
      expect(
        (await repo.bills(query: bills.first.code.toLowerCase()))
            .items
            .single
            .id,
        bills.first.id,
      );
      final aziz = (await repo.bills(query: 'aZiZ')).total;
      expect(aziz, greaterThanOrEqualTo(85));
      expect((await repo.bills(query: 'cobalt')).total, aziz);
      expect((await repo.bills(query: '01a777aa')).total, aziz);
      expect((await repo.bills(query: '%')).total, 0);
      expect(
        (await repo.bills(view: BillView.drafts)).items.map((b) => b.status),
        everyElement('draft'),
      );
    },
  );

  for (final locale in ['uz', 'en', 'ru']) {
    for (final width in [360.0, 1024.0]) {
      testWidgets(
        'invoice tabs, search and paging fit $locale at ${width}dp and 130% text',
        (tester) async {
          final server = HistoryServer();
          final state = await openHistory(tester, server);
          tester.view.physicalSize = Size(width, 844);
          tester.platformDispatcher.textScaleFactorTestValue = 1.3;
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          await state.setLocale(Locale(locale));
          await tester.pumpAndSettle();
          if (const bool.fromEnvironment('WRITE_PREVIEWS')) {
            await tester.runAsync(() async {
              final boundary = tester.renderObject<RenderRepaintBoundary>(
                find.byKey(const ValueKey('invoice-preview')),
              );
              final image = await boundary.toImage();
              final data = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              final file = File(
                'docs/previews/invoices-$locale-${width.toInt()}.png',
              );
              await file.parent.create(recursive: true);
              await file.writeAsBytes(data!.buffer.asUint8List());
              image.dispose();
            });
          }
          final tabs = find.byType(PillSegments<BillView>);
          expect(tabs, findsOneWidget);
          for (final segment in find
              .descendant(of: tabs, matching: find.byType(InkWell))
              .evaluate()) {
            expect(
              (segment.renderObject as RenderBox).size.height,
              greaterThanOrEqualTo(Touch.standard),
            );
          }
          await tester.scrollUntilVisible(
            find.text('INV-55'),
            400,
            scrollable: scroll,
          );
          await tester.pumpAndSettle();
          expect(server.requests.last.queryParameters['page'], '2');
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
