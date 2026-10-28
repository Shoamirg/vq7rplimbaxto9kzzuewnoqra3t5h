import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/design/qr.dart';
import 'package:garageos_staff/design/widgets.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/ui/chat.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/dock.dart';
import 'support/fonts.dart';

/// Walks every role's screens in demo mode at the 360dp Android check width
/// with 130% text: any overflow or exception fails the walk. Set
/// CAPTURE_DIR to also write a PNG of each screen.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final key = GlobalKey();
  late WidgetTester t;
  late String prefix;
  final vertical = find.byWidgetPredicate(
    (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
  );

  Future<void> settle() async {
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  }

  Future<void> capture(String name) async {
    const dir = String.fromEnvironment('CAPTURE_DIR');
    if (dir.isEmpty) return;
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await t.runAsync(() async {
      final image = await boundary.toImage();
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory(dir).create(recursive: true);
      await File(
        '$dir/$prefix-$name.png',
      ).writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  /// Brings [finder] on screen, scrolling the current page when needed.
  Future<void> reveal(Finder finder) async {
    if (finder.evaluate().isEmpty) {
      await t.scrollUntilVisible(finder, 250, scrollable: vertical.first);
    }
    await t.ensureVisible(finder.first);
    await settle();
  }

  Future<void> tap(Finder finder) async {
    // A toast from the previous step may still cover the bottom edge.
    t
        .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger).first)
        .removeCurrentSnackBar();
    await settle();
    await reveal(finder);
    await t.tap(finder.first);
    await settle();
  }

  Future<void> back() async {
    await t.tap(find.byType(BackButton).last);
    await settle();
  }

  // PRIMARY renders the 390×844 iPhone target at normal text size instead of
  // the 360dp/130% stress check; DARK switches the theme. Both are for
  // reviewing captures.
  const primary = bool.fromEnvironment('PRIMARY');
  const dark = bool.fromEnvironment('DARK');

  Future<AppState> open(String language) async {
    t.view.physicalSize = primary ? const Size(390, 844) : const Size(360, 800);
    t.view.devicePixelRatio = 1;
    t.platformDispatcher.textScaleFactorTestValue = primary ? 1 : 1.3;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    final state = AppState()
      ..locale = Locale(language)
      ..themeMode = dark ? ThemeMode.dark : ThemeMode.light;
    addTearDown(state.dispose);
    await t.pumpWidget(
      RepaintBoundary(key: key, child: GarageApp(state: state)),
    );
    await settle();
    return state;
  }

  for (final language in ['uz', 'ru', 'en']) {
    testWidgets('$language customer panel: all 14 screens', (tester) async {
      t = tester;
      prefix = '$language-customer';
      final s = await AppLocalizations.delegate.load(Locale(language));
      final state = await open(language);
      state.demo(DemoRole.customer);
      await settle();

      // Home: greeting, next visit, estimate alert, health, SOS.
      expect(find.text(s.helloName('Aziz')), findsOneWidget);
      expect(find.text(s.nextVisit), findsOneWidget);
      await capture('home');

      // Estimate detail: approve with the emerald pill.
      await tap(find.text(s.openEstimate));
      expect(find.text('EST-2026-000012'), findsWidgets);
      await capture('estimate');
      await tap(find.widgetWithText(FilledButton, s.approve));
      expect(find.text(s.approved), findsOneWidget);
      await back();
      expect(find.text(s.openEstimate), findsNothing);

      // Car detail → service passport with QR.
      await tap(find.text(s.carHealth));
      expect(find.text(s.healthByArea), findsOneWidget);
      await capture('car-detail');
      await tap(find.text(s.sharePassport));
      await capture('passport');
      expect(find.byType(QrSeal), findsOneWidget);
      await back();
      await back();

      // My appointments: upcoming and past.
      await tap(find.text(s.myAppointments));
      await capture('appointments');
      await tap(segment(s.past));
      expect(find.byType(DateSlotCard), findsWidgets);
      await back();

      // Book a service → request waits for confirmation.
      await tap(find.text(s.bookService).last);
      await t.enterText(find.byType(TextFormField), 'Tormoz tekshiruvi');
      await settle();
      await capture('booking');
      var bookingDay = DateTime.now().add(const Duration(days: 1));
      if (bookingDay.weekday == DateTime.sunday) bookingDay = bookingDay.add(const Duration(days: 1));
      await tap(find.text('${bookingDay.day}'));
      await tap(find.widgetWithText(FilledButton, s.sendBooking));
      await capture('booking-result');
      expect(find.text(s.bookingWaitingConfirmation), findsOneWidget);

      // Roadside help: car + problem → map → live tracker.
      await tap(find.text('SOS'));
      await capture('roadside-step1');
      await tap(find.text('Chevrolet Cobalt · 01 A 777 AA'));
      await tap(find.text(s.problemWontStart));
      await tap(find.widgetWithText(FilledButton, s.continueLabel));
      expect(find.text(s.yourLocation), findsOneWidget);
      await capture('roadside-step2');
      await tap(find.widgetWithText(FilledButton, s.requestHelp));
      expect(find.text(s.stageNew), findsWidgets);
      await tap(find.text(s.refreshStatus));
      await tap(find.text(s.refreshStatus));
      expect(find.text('Usta Sherzod'), findsWidgets);
      await capture('roadside-tracker');
      await back();

      // Cars tab.
      await t.tap(dockTab(s.cars));
      await settle();
      expect(find.text('Chevrolet Cobalt 2021'), findsOneWidget);
      await capture('cars');

      // Billing tab → invoice detail.
      await t.tap(dockTab(s.billing));
      await settle();
      expect(find.text(s.totalOwed), findsOneWidget);
      await capture('billing');
      await tap(find.text('INV-2026-000142'));
      expect(find.text(s.remainingAmount), findsOneWidget);
      await capture('invoice');
      await back();

      // Messages → chat thread: send text and a photo.
      await t.tap(dockTab(s.messages));
      await settle();
      await capture('messages');
      await tap(find.byType(ThreadTile).first);
      await capture('chat');
      await t.tap(find.byTooltip(s.attachPhoto));
      await settle();
      await t.tap(find.text(s.camera));
      await settle();
      await t.enterText(find.byType(TextField).last, 'Rahmat!');
      await t.tap(find.byTooltip(s.send));
      await settle();
      expect(find.text('Rahmat!'), findsOneWidget);
      await back();

      // Profile: delete account asks first; settings and notifications.
      await t.tap(dockTab(s.profile));
      await settle();
      await capture('profile');
      await tap(find.widgetWithText(FilledButton, s.deleteAccount));
      expect(find.text(s.deleteAccountTitle), findsOneWidget);
      await capture('delete-sheet');
      await t.tap(find.widgetWithText(OutlinedButton, s.stay));
      await settle();
      await tap(find.text(s.settings));
      await tap(find.text(s.themeDark));
      await capture('settings');
      await tap(find.text(s.notifications));
      await capture('notifications');
      await t.tap(find.text(s.allow));
      await settle();
      expect(state.notificationsAllowed, isTrue);
      await back();
      expect(t.takeException(), isNull);
    });

    testWidgets('$language reception panel: inbox, customer card, editor', (
      tester,
    ) async {
      t = tester;
      prefix = '$language-reception';
      final s = await AppLocalizations.delegate.load(Locale(language));
      final state = await open(language);
      state.demo();
      await settle();
      await capture('jobs');

      // New job form.
      await t.tap(find.byType(FloatingActionButton));
      await settle();
      await capture('new-job');
      await back();

      // Customers → customer card → open app login → new car form.
      await t.tap(dockTab(s.customers));
      await settle();
      await capture('customers');
      await tap(find.text('Dilnoza Saidova'));
      expect(find.text(s.lifetimeValue), findsOneWidget);
      await capture('customer-card');
      await tap(find.widgetWithText(OutlinedButton, s.openAppLogin));
      await t.enterText(find.byType(TextField).last, 'dilnoza@example.com');
      await t.tap(find.widgetWithText(FilledButton, s.openAppLogin).last);
      await settle();
      expect(find.text(s.temporaryPassword), findsOneWidget);
      await t.tapAt(const Offset(180, 40));
      await settle();
      await tap(find.byTooltip(s.addVehicle));
      await capture('new-car');
      await back();
      await back();

      // Invoices: drafts tab → draft → send to customer.
      await t.tap(dockTab(s.invoices));
      await settle();
      await capture('invoices');
      await tap(segment(s.drafts));
      await tap(find.text('INV-2026-000143'));
      await tap(find.widgetWithText(FilledButton, s.sendToCustomer));
      expect(find.text(s.recordOrCheckPayment), findsOneWidget);
      await capture('invoice-detail');
      await tap(find.text(s.recordOrCheckPayment));
      await tap(find.text(s.online));
      await capture('record-payment');
      await back();
      await back();

      // Inbox → reply.
      await t.tap(dockTab(s.inbox));
      await settle();
      await capture('inbox');
      await tap(find.text('Aziz Karimov'));
      await t.enterText(find.byType(TextField).last, 'Kutamiz');
      await t.tap(find.byTooltip(s.send));
      await settle();
      expect(find.text('Kutamiz'), findsOneWidget);
      await back();

      await t.tap(dockTab(s.settings));
      await settle();
      await capture('settings');
      expect(t.takeException(), isNull);
    });

    testWidgets('$language mechanic panel: start and finish with a note', (
      tester,
    ) async {
      t = tester;
      prefix = '$language-mechanic';
      final s = await AppLocalizations.delegate.load(Locale(language));
      final state = await open(language);
      state.demo(DemoRole.mechanic);
      await settle();
      await capture('jobs');
      await tap(find.text('BYD Song Plus'));
      await capture('job');
      final start = find.widgetWithText(FilledButton, s.startWork);
      expect(t.getSize(start).height, greaterThanOrEqualTo(64));
      await t.tap(start);
      await settle();
      await t.tap(find.widgetWithText(FilledButton, s.completeWork));
      await settle();
      await t.enterText(find.byType(TextField).last, 'Kolodkalar almashtirildi');
      await t.tap(find.widgetWithText(FilledButton, s.completeWork).last);
      await settle();
      expect(find.text(s.workDone), findsWidgets);
      await capture('done');
      expect(t.takeException(), isNull);
    });

    testWidgets('$language welcome, sign-up and password reset in demo mode', (
      tester,
    ) async {
      t = tester;
      prefix = '$language-auth';
      final s = await AppLocalizations.delegate.load(Locale(language));
      final state = await open(language);
      await capture('welcome');
      await tap(find.byType(Switch));
      expect(state.demoMode, isTrue);
      await tap(find.text(s.enterAsCustomer));
      await capture('sign-in');

      // Forgot password: identifier → OTP + new password.
      await tap(find.text(s.forgotPassword));
      await tap(find.widgetWithText(FilledButton, s.sendCode));
      await t.enterText(find.byType(TextField).first, '123456');
      await t.enterText(find.byType(TextFormField).last, 'yangi-parol-2026');
      await settle();
      await capture('reset');
      await tap(find.widgetWithText(FilledButton, s.confirm));
      expect(find.text(s.passwordUpdated), findsOneWidget);

      // Sign up: phone & email → code → password → garage → notifications.
      await tap(find.text(s.createAccount));
      await t.enterText(find.byType(TextFormField).at(0), '+998 93 555 44 33');
      await t.enterText(find.byType(TextFormField).at(1), 'dilnoza@example.com');
      await settle();
      await capture('sign-up-1');
      await tap(find.widgetWithText(FilledButton, s.continueLabel));
      await t.enterText(find.byType(TextField).first, '000000');
      await tap(find.widgetWithText(FilledButton, s.continueLabel));
      expect(find.text(s.wrongCode), findsOneWidget);
      await t.enterText(find.byType(TextField).first, '482913');
      await tap(find.widgetWithText(FilledButton, s.continueLabel));
      await t.enterText(find.byType(TextFormField).first, 'mashina-2026!');
      await tap(find.widgetWithText(FilledButton, s.continueLabel));
      await capture('sign-up-4');
      await tap(find.text('Turon avtoservis'));
      await tap(find.widgetWithText(FilledButton, s.createAccount));
      expect(find.text(s.notificationsTitle), findsOneWidget);
      await t.tap(find.text(s.notNow));
      await settle();
      expect(state.customerRepository, isNotNull);
      expect(find.text(s.helloName('Aziz')), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
}
