import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/main.dart';

import 'support/fonts.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  for (final item in [
    (
      name: 'staff-light',
      size: const Size(390, 844),
      mode: ThemeMode.light,
      locale: 'uz',
    ),
    (
      name: 'staff-dark',
      size: const Size(390, 844),
      mode: ThemeMode.dark,
      locale: 'uz',
    ),
    (
      name: 'staff-tablet',
      size: const Size(1024, 768),
      mode: ThemeMode.light,
      locale: 'uz',
    ),
    (
      name: 'staff-en',
      size: const Size(390, 844),
      mode: ThemeMode.light,
      locale: 'en',
    ),
    (
      name: 'staff-ru',
      size: const Size(390, 844),
      mode: ThemeMode.dark,
      locale: 'ru',
    ),
  ]) {
    testWidgets(
      '${item.name}: responsive layout, real font and touch targets',
      (tester) async {
        tester.view.physicalSize = item.size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final state = AppState()
          ..demo()
          ..themeMode = item.mode
          ..locale = Locale(item.locale);
        addTearDown(state.dispose);
        final key = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: key,
            child: GarageApp(state: state),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(
          find.byTooltip(
            item.locale == 'uz'
                ? 'Yangilash'
                : item.locale == 'en'
                ? 'Refresh'
                : 'Обновить',
          ),
        );
        await tester.tap(
          find.byTooltip(
            item.locale == 'uz'
                ? 'Yangilash'
                : item.locale == 'en'
                ? 'Refresh'
                : 'Обновить',
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(
          find.widgetWithText(
            FilledButton,
            item.locale == 'uz'
                ? 'Yangi navbat'
                : item.locale == 'en'
                ? 'New appointment'
                : 'Новая запись',
          ),
          -200,
          scrollable: find.byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester
              .getSize(
                find.widgetWithText(
                  FilledButton,
                  item.locale == 'uz'
                      ? 'Yangi navbat'
                      : item.locale == 'en'
                      ? 'New appointment'
                      : 'Новая запись',
                ),
              )
              .height,
          greaterThanOrEqualTo(48),
        );
        expect(
          find.byType(NavigationRail),
          item.size.width > 720 ? findsOneWidget : findsNothing,
        );
        if (const bool.fromEnvironment('WRITE_PREVIEWS')) {
          await tester.runAsync(() async {
            final boundary =
                key.currentContext!.findRenderObject() as RenderRepaintBoundary;
            final image = await boundary.toImage();
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            final file = File('docs/previews/${item.name}.png');
            await file.parent.create(recursive: true);
            await file.writeAsBytes(data!.buffer.asUint8List());
            image.dispose();
          });
        }
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}
