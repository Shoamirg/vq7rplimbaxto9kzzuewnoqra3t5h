import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final text = FontLoader('Golos Text')
      ..addFont(rootBundle.load('assets/fonts/GolosText.ttf'));
    await text.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  for (final item in [
    (name: 'staff-light', size: const Size(390, 844), mode: ThemeMode.light),
    (name: 'staff-dark', size: const Size(390, 844), mode: ThemeMode.dark),
    (name: 'staff-tablet', size: const Size(1024, 768), mode: ThemeMode.light),
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
          ..themeMode = item.mode;
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
        await tester.ensureVisible(find.byTooltip('Yangilash'));
        await tester.tap(find.byTooltip('Yangilash'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          tester
              .getSize(find.widgetWithText(FilledButton, 'Yangi navbat'))
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
