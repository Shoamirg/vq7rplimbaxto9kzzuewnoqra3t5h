import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/design/bento.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/ui/staff_home.dart';

import 'support/dock.dart';
import 'support/fonts.dart';

Map<String, dynamic> oldJob(int index) => {
  'id': 'old-$index',
  'customer_id': 'customer-$index',
  'customer_name': 'Old customer $index',
  'vehicle_id': 'car-$index',
  'vehicle_summary': 'Cobalt (01A${index}BC)',
  'appointment_date': '2020-05-01',
  'appointment_time': '10:00',
  'estimated_duration_minutes': 60,
  'status': 'in_progress',
  'mechanic_name': 'Sherzod',
};

class OngoingServer {
  final requests = <Uri>[];
  Completer<http.Response>? pending;
  http.Response json(Object value, [int status = 200]) => http.Response(
    jsonEncode(value),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
  Future<http.Response> respond(http.Request request) async {
    final uri = request.url;
    if (uri.path.endsWith('/customers')) return json({'items': [], 'total': 0});
    if (!uri.path.endsWith('/appointments')) {
      if (uri.path.endsWith('/invoice')) return json({}, 404);
      return json(oldJob(int.parse(uri.path.split('-').last)));
    }
    requests.add(uri);
    final delayed = pending;
    pending = null;
    if (delayed != null) return delayed.future;
    if (uri.queryParameters.containsKey('date_from')) {
      return json({'items': [], 'total': 0});
    }
    final query = uri.queryParameters['q'] ?? '';
    final all = List.generate(
      31,
      oldJob,
    ).where((row) => row['customer_name'].contains(query)).toList();
    final page = int.parse(uri.queryParameters['page']!);
    return json({
      'items': all.skip((page - 1) * 30).take(30).toList(),
      'total': all.length,
    });
  }
}

JobFilter selectedFilter(WidgetTester tester) => tester
    .widget<PillSegments<JobFilter>>(find.byType(PillSegments<JobFilter>))
    .selected;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final size in [const Size(390, 844), const Size(834, 1194)]) {
    for (final language in ['uz', 'en', 'ru']) {
      testWidgets(
        '$language ${size.width}: ongoing shortcut sends all-date filter and retains search/page/navigation',
        (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          tester.platformDispatcher.textScaleFactorTestValue = 1.3;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          final server = OngoingServer();
          final api = ApiClient(
            'http://example.test/api/v1',
            client: MockClient(server.respond),
          )..accessToken = 'test-only';
          final state = AppState()
            ..repository = LiveRepository(api)
            ..locale = Locale(language)
            ..name = 'Staff'
            ..garageName = 'Garage';
          addTearDown(state.dispose);
          final strings = await AppLocalizations.delegate.load(
            Locale(language),
          );
          await tester.pumpWidget(GarageApp(state: state));
          await tester.pumpAndSettle();
          await tapSegment(tester, strings.ongoingShort);
          expect(server.requests.last.queryParameters['status'], 'in_progress');
          expect(
            server.requests.last.queryParameters.containsKey('date_from'),
            isFalse,
          );
          expect(
            server.requests.last.queryParameters.containsKey('date_to'),
            isFalse,
          );
          expect(find.text('Old customer 0'), findsOneWidget);
          // Read-only staff get no intake action.
          expect(find.text(strings.newAppointment), findsNothing);
          await tester.enterText(find.byType(TextField), 'Old customer 30');
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pumpAndSettle();
          expect(server.requests.last.queryParameters['q'], 'Old customer 30');
          final result = find.descendant(
            of: find.byType(WorkTile),
            matching: find.text('Old customer 30'),
          );
          expect(result, findsOneWidget);
          // Open detail and return without changing the list's selected view.
          await tester.tap(result);
          await tester.pumpAndSettle();
          await tester.tap(find.byType(BackButton).first);
          await tester.pumpAndSettle();
          await tester.tap(dockTab(strings.customers));
          await tester.pumpAndSettle();
          await tester.tap(dockTab(strings.jobs));
          await tester.pumpAndSettle();
          expect(selectedFilter(tester), JobFilter.ongoing);
          expect(
            tester.widget<TextField>(find.byType(TextField)).controller!.text,
            'Old customer 30',
          );
          await state.setLocale(Locale(language == 'ru' ? 'en' : 'ru'));
          await tester.pumpAndSettle();
          final changed = await AppLocalizations.delegate.load(
            Locale(language == 'ru' ? 'en' : 'ru'),
          );
          expect(selectedFilter(tester), JobFilter.ongoing);
          await tester.enterText(find.byType(TextField), 'missing');
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pumpAndSettle();
          expect(server.requests.last.queryParameters['status'], 'in_progress');
          expect(find.byType(WorkTile), findsNothing);
          await tapSegment(tester, changed.all);
          expect(
            server.requests.last.queryParameters.containsKey('status'),
            isFalse,
          );
          expect(
            server.requests.last.queryParameters.containsKey('date_from'),
            isFalse,
          );
          expect(server.requests.last.queryParameters['q'], 'missing');
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  testWidgets(
    'ongoing shortcut supports pagination and retry without resetting selection',
    (tester) async {
      final server = OngoingServer();
      final api = ApiClient(
        'http://example.test/api/v1',
        client: MockClient(server.respond),
      )..accessToken = 'test-only';
      final state = AppState()
        ..repository = LiveRepository(api)
        ..name = 'Staff'
        ..garageName = 'Garage';
      addTearDown(state.dispose);
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      await tapSegment(tester, 'Jarayonda');
      // Scrolling to the end loads the next page.
      await tester.scrollUntilVisible(
        find.text('Old customer 30'),
        600,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(server.requests.last.queryParameters['page'], '2');
      expect(find.text('Old customer 30'), findsOneWidget);
      final failed = Completer<http.Response>();
      server.pending = failed;
      await tester.scrollUntilVisible(
        find.byTooltip('Yangilash'),
        -600,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byTooltip('Yangilash'));
      await tester.pump();
      failed.complete(server.json({}, 503));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Qayta urinish'));
      await tester.pumpAndSettle();
      // Retry reloads every page the reader had loaded.
      expect(server.requests.last.queryParameters['page'], '2');
      expect(server.requests.last.queryParameters['status'], 'in_progress');
      expect(selectedFilter(tester), JobFilter.ongoing);
    },
  );

  testWidgets('demo shortcut shows work from prior dates', (tester) async {
    final state = AppState()
      ..repository = DemoRepository(today: DateTime(2020, 5, 1))
      ..name = 'Staff'
      ..garageName = 'Garage';
    addTearDown(state.dispose);
    await tester.pumpWidget(GarageApp(state: state));
    await tester.pumpAndSettle();
    await tapSegment(tester, 'Jarayonda');
    expect(find.text('Dilnoza Saidova'), findsOneWidget);
    expect(find.text('Aziz Karimov'), findsNothing);
    expect(find.text('Bekzod Aliyev'), findsNothing);
  });
}
