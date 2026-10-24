import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';

import 'support/dock.dart';
import 'support/fonts.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/main.dart';

class CustomerHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  for (final width in [390.0, 834.0]) {
    for (final code in ['uz', 'en', 'ru']) {
      testWidgets(
        '$code $width: customer reads own vehicles, work and payment history',
        (tester) async {
          SharedPreferences.setMockInitialValues({});
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final state = AppState()..locale = Locale(code);
          final strings = await AppLocalizations.delegate.load(Locale(code));
          final captureKey = GlobalKey();
          final paths = <String>[];
          await HttpOverrides.runWithHttpOverrides(() async {
            final server = (await tester.runAsync(
              () => HttpServer.bind(InternetAddress.loopbackIPv4, 0),
            ))!;
            await tester.runAsync(() async {
              server.listen((request) async {
                paths.add(request.uri.path);
                dynamic result;
                if (request.uri.path.endsWith('/customer/auth/login')) {
                  result = {
                    'access_token': 'customer-token',
                    'refresh_token': 'customer-refresh',
                  };
                } else if (request.uri.path.endsWith('/customer/me')) {
                  result = {
                    'full_name': 'Ali',
                    'garage': {'name': 'Turon'},
                  };
                } else if (request.uri.path.endsWith('/history/vehicles')) {
                  result = {
                    'items': [
                      {'id': 'car1', 'title': 'Cobalt', 'detail': '01A123BC'},
                    ],
                    'page': 1,
                    'total': 1,
                  };
                } else if (request.uri.path.endsWith('/history/appointments')) {
                  result = {
                    'items': [
                      {
                        'id': 'work1',
                        'title': '2026-10-06 10:00',
                        'detail': 'completed',
                      },
                    ],
                    'page': 1,
                    'total': 1,
                  };
                } else if (request.uri.path.endsWith('/history/invoices')) {
                  result = {
                    'items': [
                      {
                        'id': 'invoice1',
                        'title': 'INV-1',
                        'detail': 'paid',
                        'currency': 'UZS',
                        'total': 150000,
                        'balance': 0,
                      },
                    ],
                    'page': 1,
                    'total': 1,
                  };
                } else if (request.uri.path.endsWith(
                  '/history/invoices/invoice1',
                )) {
                  result = {
                    'code': 'INV-1',
                    'currency': 'UZS',
                    'total': 150000,
                    'balance': 0,
                    'lines': [
                      {
                        'description': 'Moy almashtirish',
                        'quantity': 1,
                        'total': 150000,
                      },
                    ],
                    'payments': [
                      {
                        'amount': 150000,
                        'kind': 'deposit',
                        'method': 'cash',
                        'date': '2026-10-06',
                      },
                    ],
                  };
                } else {
                  request.response.statusCode = 403;
                  result = {};
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
                  'ali@example.com',
                  'test-only',
                  customer: true,
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
                const dir = String.fromEnvironment('CAPTURE_DIR');
                if (dir.isEmpty) return;
                final boundary =
                    captureKey.currentContext!.findRenderObject()!
                        as RenderRepaintBoundary;
                await tester.runAsync(() async {
                  final image = await boundary.toImage();
                  final bytes = await image.toByteData(
                    format: ui.ImageByteFormat.png,
                  );
                  await Directory(dir).create(recursive: true);
                  await File('$dir/$code-${width.toInt()}-$name.png')
                      .writeAsBytes(bytes!.buffer.asUint8List());
                  image.dispose();
                });
              }

              await settle();
              expect(find.text(strings.helloName('Ali')), findsOneWidget);
              await capture('home');
              await tester.tap(dockTab(strings.cars));
              await settle();
              expect(find.text('Cobalt'), findsOneWidget);
              await capture('vehicles');
              expect(find.text('Yangi navbat'), findsNothing);
              await tester.tap(dockTab(strings.home));
              await settle();
              await tester.tap(find.text(strings.myAppointments));
              await settle();
              await tapSegment(tester, strings.past);
              await settle();
              expect(find.text('10:00'), findsOneWidget);
              expect(find.text(strings.workDone), findsOneWidget);
              await tester.tap(find.byType(BackButton));
              await settle();
              await tester.tap(dockTab(strings.billing));
              await settle();
              await tester.tap(find.text('INV-1'));
              await settle();
              expect(find.text('Moy almashtirish'), findsOneWidget);
              await tester.scrollUntilVisible(
                find.textContaining(strings.customerDeposit),
                200,
                scrollable: find
                    .byWidgetPredicate(
                      (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
                    )
                    .last,
              );
              expect(
                find.textContaining(strings.customerDeposit),
                findsOneWidget,
              );
              await capture('invoice');
              expect(tester.takeException(), isNull);
              expect(find.textContaining('150'), findsWidgets);
              expect(
                paths.every((p) => p.startsWith('/api/v1/customer/')),
                isTrue,
              );
              expect(find.text('Toʻlov kiritish'), findsNothing);
            } finally {
              state.dispose();
              await tester.runAsync(() => server.close(force: true));
            }
          }, CustomerHttp());
        },
      );
    }
  }
}
