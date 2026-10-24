import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/ui/mechanic/jobs.dart';
import 'package:garageos_staff/ui/staff_home.dart';

import 'support/dock.dart';
import 'support/fonts.dart';
import 'ongoing_work_test.dart' show oldJob, OngoingServer, selectedFilter;

class AwaitingServer extends OngoingServer {
  @override
  Future<http.Response> respond(http.Request request) async {
    final uri = request.url;
    requests.add(uri);
    final delayed = pending;
    pending = null;
    if (delayed != null) return delayed.future;
    if (uri.queryParameters.containsKey('date_from')) {
      return json({'items': [], 'total': 0});
    }
    final all =
        List.generate(
              31,
              (i) => {
                ...oldJob(i),
                'status': 'completed',
                'awaiting_invoice': true,
                'final_invoice_id': null,
              },
            )
            .where(
              (row) => (row['customer_name'] as String).contains(
                uri.queryParameters['q'] ?? '',
              ),
            )
            .toList();
    final page = int.parse(uri.queryParameters['page']!);
    return json({
      'items': all.skip((page - 1) * 30).take(30).toList(),
      'total': all.length,
    });
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final size in [const Size(390, 844), const Size(834, 1194)]) {
    for (final language in ['uz', 'en', 'ru']) {
      testWidgets(
        '$language ${size.width}: demo awaiting queue clears after one invoice and existing invoice opens',
        (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          tester.platformDispatcher.textScaleFactorTestValue = 1.3;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          final repo = DemoRepository(today: DateTime(2020, 5, 1));
          final state = AppState()
            ..repository = repo
            ..locale = Locale(language)
            ..name = 'Staff'
            ..garageName = 'Garage';
          addTearDown(state.dispose);
          final strings = await AppLocalizations.delegate.load(
            Locale(language),
          );
          await tester.pumpWidget(GarageApp(state: state));
          await tester.pumpAndSettle();
          await tapSegment(tester, strings.awaitingInvoiceShort);
          expect(selectedFilter(tester), JobFilter.awaitingInvoice);
          final tile = find.widgetWithText(WorkTile, 'Bekzod Aliyev');
          expect(
            find.descendant(
              of: tile,
              matching: find.text(strings.awaitingInvoiceWork),
            ),
            findsOneWidget,
          );
          await tester.ensureVisible(tile);
          await tester.pumpAndSettle();
          await tester.tap(tile);
          await tester.pumpAndSettle();
          await tester.tap(find.text(strings.createInvoice));
          await tester.pumpAndSettle();
          final price = find.byType(TextFormField).at(2);
          await tester.ensureVisible(price);
          await tester.pumpAndSettle();
          await tester.enterText(price, '100000');
          await tester.pumpAndSettle();
          await tester.tap(
            find.widgetWithText(FilledButton, strings.sendToCustomer),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byType(BackButton).first);
          await tester.pumpAndSettle();
          expect(find.text(strings.openInvoice), findsOneWidget);
          await tester.tap(find.byType(BackButton).first);
          await tester.pumpAndSettle();
          expect(find.byType(WorkTile), findsNothing);
          expect(selectedFilter(tester), JobFilter.awaitingInvoice);
          await tapSegment(tester, strings.all);
          await tester.scrollUntilVisible(
            tile,
            200,
            scrollable: find.byType(Scrollable).first,
          );
          expect(
            find.descendant(
              of: tile,
              matching: find.text(strings.awaitingInvoiceWork),
            ),
            findsNothing,
          );
          await tester.ensureVisible(tile);
          await tester.pumpAndSettle();
          await tester.tap(tile);
          await tester.pumpAndSettle();
          await tester.tap(find.text(strings.openInvoice));
          await tester.pumpAndSettle();
          expect(
            (await repo.bills()).items.where((b) => b.appointmentId == 'w3'),
            hasLength(1),
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets(
    'live awaiting queue sends authoritative filter with search/pages and retry for read-only staff',
    (tester) async {
      final server = AwaitingServer();
      final api = ApiClient(
        'http://example.test/api/v1',
        client: MockClient(server.respond),
      )..accessToken = 'test-only';
      final state = AppState()
        ..repository = LiveRepository(api)
        ..name = 'Staff'
        ..garageName = 'Garage';
      addTearDown(state.dispose);
      final strings = await AppLocalizations.delegate.load(const Locale('uz'));
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      await tapSegment(tester, strings.awaitingInvoiceShort);
      expect(server.requests.last.queryParameters['awaiting_invoice'], 'true');
      expect(server.requests.last.queryParameters['status'], 'completed');
      expect(
        server.requests.last.queryParameters.containsKey('date_from'),
        isFalse,
      );
      expect(find.text(strings.newAppointment), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Old customer 30'),
        600,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '2');
      final failed = Completer<http.Response>();
      server.pending = failed;
      await tester.scrollUntilVisible(
        find.byTooltip(strings.refresh),
        -600,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byTooltip(strings.refresh));
      await tester.pump();
      failed.complete(server.json({}, 503));
      await tester.pumpAndSettle();
      await tester.tap(find.text(strings.retry));
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '2');
      expect(server.requests.last.queryParameters['awaiting_invoice'], 'true');
      await tester.enterText(find.byType(TextField), 'missing');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '1');
      expect(server.requests.last.queryParameters['q'], 'missing');
      expect(find.byType(WorkTile), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('mechanic has no financial shortcut', (tester) async {
    final server = OngoingServer();
    final api = ApiClient(
      'http://example.test/api/v1',
      client: MockClient(
        (request) async => server.json({
          'items': [
            {...oldJob(0), 'status': 'completed'},
          ],
          'total': 1,
        }),
      ),
    )..accessToken = 'test-only';
    final repo = LiveRepository(api, isMechanic: true);
    final strings = await AppLocalizations.delegate.load(const Locale('uz'));
    final state = AppState()
      ..repository = repo
      ..name = 'Mechanic'
      ..garageName = 'Garage';
    addTearDown(state.dispose);
    await tester.pumpWidget(GarageApp(state: state));
    await tester.pumpAndSettle();
    expect(segment(strings.awaitingInvoiceShort), findsNothing);
    expect(find.text(strings.awaitingInvoiceWork), findsNothing);
    expect(find.byType(MechanicJobCard), findsOneWidget);
    expect(tester.takeException(), isNull);
    await expectLater(
      repo.works(awaitingInvoice: true),
      throwsA(
        isA<AppFailure>().having((e) => e.status, 'financial permission', 403),
      ),
    );
  });

  testWidgets('staff does not infer a missing invoice from unknown metadata', (
    tester,
  ) async {
    final server = OngoingServer();
    final api = ApiClient(
      'http://example.test/api/v1',
      client: MockClient(
        (request) async => server.json({
          'items': [
            {...oldJob(0), 'status': 'completed'},
          ],
          'total': 1,
        }),
      ),
    )..accessToken = 'test-only';
    final state = AppState()
      ..repository = LiveRepository(api)
      ..name = 'Staff'
      ..garageName = 'Garage';
    addTearDown(state.dispose);
    final strings = await AppLocalizations.delegate.load(const Locale('uz'));
    await tester.pumpWidget(GarageApp(state: state));
    await tester.pumpAndSettle();
    final tile = find.byType(WorkTile);
    expect(tile, findsOneWidget);
    expect(
      find.descendant(
        of: tile,
        matching: find.text(strings.awaitingInvoiceWork),
      ),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });
}
