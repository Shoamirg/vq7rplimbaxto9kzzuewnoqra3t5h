import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RealHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
    for (final entry in manifest) {
      final loader = FontLoader(entry['family'] as String);
      for (final font in entry['fonts'] as List) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });
  for (final size in [const Size(390, 844), const Size(834, 1194)]) {
    for (final code in ['uz', 'en', 'ru']) {
      testWidgets(
        '$code ${size.width}: assigned work completes without billing or overflow',
        (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          SharedPreferences.setMockInitialValues({});
          final state = AppState()..locale = Locale(code);
          final strings = await AppLocalizations.delegate.load(Locale(code));
          final captureKey = GlobalKey();
          final paths = <String>[];
          var status = 'confirmed';
          final job = <String, dynamic>{
            'id': 'job-1',
            'customer_id': 'customer-1',
            'customer_name': 'Aziz',
            'vehicle_id': 'car-1',
            'vehicle_summary': 'Cobalt (01A123BC)',
            'appointment_date': '2020-05-01',
            'appointment_time': '10:00',
            'estimated_duration_minutes': 60,
            'mechanic_name': 'Sherzod',
            'mechanic_user_id': 'mechanic-1',
            'status': status,
          };
          await HttpOverrides.runWithHttpOverrides(() async {
            final server = (await tester.runAsync(
              () => HttpServer.bind(InternetAddress.loopbackIPv4, 0),
            ))!;
            await tester.runAsync(() async {
              server.listen((request) async {
                final path = request.uri.path;
                paths.add(path);
                dynamic result;
                if (path.endsWith('/auth/login')) {
                  result = {
                    'access_token': 'test-access',
                    'refresh_token': 'test-refresh',
                  };
                } else if (path.endsWith('/auth/me')) {
                  result = {
                    'id': 'mechanic-1',
                    'service_center_id': 'garage-1',
                    'full_name': 'Sherzod',
                    'role': 'mechanic',
                    'permissions': [
                      'work.read.assigned',
                      'work.write.assigned',
                    ],
                  };
                } else if (path.endsWith('/mechanic/work')) {
                  result = {
                    'items': [
                      {...job, 'status': status},
                    ],
                    'total': 1,
                    'page': 1,
                    'page_size': 30,
                  };
                } else if (path.endsWith('/mechanic/work/job-1')) {
                  result = {...job, 'status': status};
                } else if (path.endsWith('/mechanic/work/job-1/start')) {
                  status = 'in_progress';
                  result = {...job, 'status': status};
                } else if (path.endsWith('/mechanic/work/job-1/complete')) {
                  final body = jsonDecode(
                    await utf8.decoder.bind(request).join(),
                  ) as Map;
                  expect(body.containsKey('total_cost'), isFalse);
                  status = 'completed';
                  result = {...job, 'status': status};
                } else {
                  request.response.statusCode = 403;
                  result = {
                    'error': {'code': 'FORBIDDEN'},
                  };
                }
                request.response.headers.contentType = ContentType.json;
                request.response.write(jsonEncode(result));
                await request.response.close();
              });
            });
            try {
              await tester.runAsync(
                () => state.login(
                  'http://127.0.0.1:${server.port}/api/v1',
                  'mechanic@example.com',
                  'test-only',
                ),
              );
              await tester.pumpWidget(
                RepaintBoundary(
                  key: captureKey,
                  child: GarageApp(state: state),
                ),
              );
              Future<void> settle() async {
                for (var i = 0; i < 20; i++) {
                  await tester.pump(const Duration(milliseconds: 16));
                  await tester.runAsync(
                    () =>
                        Future<void>.delayed(const Duration(milliseconds: 10)),
                  );
                }
              }

              Future<void> capture(String name) async {
                const directory = String.fromEnvironment('CAPTURE_DIR');
                if (directory.isEmpty) return;
                final boundary =
                    captureKey.currentContext!.findRenderObject()!
                        as RenderRepaintBoundary;
                await tester.runAsync(() async {
                  final image = await boundary.toImage();
                  final bytes = await image.toByteData(
                    format: ui.ImageByteFormat.png,
                  );
                  await Directory(directory).create(recursive: true);
                  await File('$directory/$code-${size.width.toInt()}-$name.png')
                      .writeAsBytes(bytes!.buffer.asUint8List());
                  image.dispose();
                });
              }

              await settle();
              expect(find.text(strings.myWork), findsWidgets);
              expect(find.byType(NavigationBar), findsNothing);
              expect(find.text(strings.newAppointment), findsNothing);
              expect(
                find.text('Cobalt'),
                findsOneWidget,
                reason: paths.join(', '),
              );
              await capture('list');
              await tester.tap(find.text('Cobalt').first);
              await settle();
              await capture('detail');
              await tester.tap(find.text(strings.startWork));
              await settle();
              expect(status, 'in_progress');
              await tester.tap(find.text(strings.completeWork));
              await settle();
              expect(find.text(strings.completeWorkHint), findsNothing);
              expect(find.text(strings.completionNoteHint), findsOneWidget);
              await capture('complete');
              await tester.tap(
                find.widgetWithText(FilledButton, strings.completeWork).last,
              );
              await settle();
              expect(status, 'completed');
              expect(find.text(strings.createInvoice), findsNothing);
              expect(
                paths.any(
                  (p) => p.contains('/invoices') || p.contains('/customers'),
                ),
                isFalse,
              );
              expect(tester.takeException(), isNull);
            } finally {
              await tester.pumpWidget(const SizedBox.shrink());
              state.dispose();
              await tester.runAsync(() => server.close(force: true));
            }
          }, RealHttp());
        },
      );
    }
  }
}
