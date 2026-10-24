import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/design/theme.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/ui/booking.dart';

import 'support/fonts.dart';

class BookingRepository extends DemoRepository {
  Completer<List<Mechanic>> roster = Completer<List<Mechanic>>();
  Json? submitted;
  bool writable = true;
  @override
  bool get canWrite => writable;
  @override
  Future<List<Mechanic>> mechanics() => roster.future;
  @override
  Future<Work> createWork(Json data) async {
    submitted = data;
    return work('w1');
  }
}

Widget host(BookingRepository repo, String locale) => MaterialApp(
  locale: Locale(locale),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  theme: garageTheme(Brightness.light),
  home: BookingScreen(
    repository: repo,
    customer: const Customer('c1', 'Aziz Karimov', '+998901234567'),
    car: const Car('v1', 'c1', 'Chevrolet Cobalt', '01A123BC', 2021, 84216),
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);
  for (final language in ['uz', 'en', 'ru']) {
    testWidgets(
      '$language booking distinguishes equal names and submits chosen account',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final strings = await AppLocalizations.delegate.load(Locale(language));
        final repo = BookingRepository();
        await tester.pumpWidget(host(repo, language));
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text(strings.assignMechanic),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.ensureVisible(find.text(strings.assignMechanic));
        await tester.pumpAndSettle();
        await tester.tap(find.text(strings.assignMechanic));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byType(LinearProgressIndicator), findsOneWidget);
        repo.roster.complete(const [
          Mechanic('first', 'Sherzod', 'first@example.com'),
          Mechanic('second', 'Sherzod', 'second@example.com'),
        ]);
        await tester.pumpAndSettle();
        expect(find.text('Sherzod'), findsNWidgets(2));
        await tester.tap(find.text('second@example.com'));
        await tester.pumpAndSettle();
        expect(find.text('second@example.com'), findsOneWidget);
        // Language changes keep the draft and selected identity.
        await tester.pumpWidget(host(repo, language == 'ru' ? 'en' : 'ru'));
        await tester.pumpAndSettle();
        final next = await AppLocalizations.delegate.load(
          Locale(language == 'ru' ? 'en' : 'ru'),
        );
        await tester.tap(find.text(next.createAppointment));
        await tester.pumpAndSettle();
        expect(repo.submitted?['mechanic_user_id'], 'second');
        expect(repo.submitted!.containsKey('mechanic_name'), isFalse);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'booking roster errors retry and empty roster permits unassigned booking',
    (tester) async {
      final strings = await AppLocalizations.delegate.load(const Locale('uz'));
      final repo = BookingRepository();
      await tester.pumpWidget(host(repo, 'uz'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(strings.assignMechanic),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text(strings.assignMechanic));
      await tester.pumpAndSettle();
      await tester.tap(find.text(strings.assignMechanic));
      await tester.pump();
      repo.roster.completeError(const AppFailure('Roster unavailable'));
      await tester.pumpAndSettle();
      expect(find.text('Roster unavailable'), findsOneWidget);
      repo.roster = Completer<List<Mechanic>>();
      await tester.tap(find.text(strings.retry));
      await tester.pump();
      repo.roster.complete(const []);
      await tester.pumpAndSettle();
      expect(find.text(strings.noMechanics), findsOneWidget);
      await tester.tap(find.byType(BackButton).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(strings.createAppointment));
      await tester.pumpAndSettle();
      expect(repo.submitted, isNotNull);
      expect(repo.submitted?['mechanic_user_id'], isNull);
    },
  );

  testWidgets('read-only booking exposes no write or assignment controls', (
    tester,
  ) async {
    final strings = await AppLocalizations.delegate.load(const Locale('uz'));
    final repo = BookingRepository()..writable = false;
    await tester.pumpWidget(host(repo, 'uz'));
    await tester.pumpAndSettle();
    expect(find.text(strings.createAppointment), findsNothing);
    await tester.scrollUntilVisible(
      find.text(strings.assignMechanic),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text(strings.assignMechanic));
    await tester.pumpAndSettle();
    await tester.tap(find.text(strings.assignMechanic), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(repo.submitted, isNull);
  });
}
