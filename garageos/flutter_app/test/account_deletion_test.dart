import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/customer_portal.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/ui/customer/profile.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _PasswordProtectedPortal extends DemoCustomerPortal {
  final attempts = <String?>[];
  @override
  bool get isDemo => false;
  @override
  Future<void> deleteAccount({String? password}) async {
    attempts.add(password);
    if (password != 'synthetic-password') {
      throw const AppFailure('Email yoki parol notoʻgʻri.', status: 401);
    }
  }
}

void main() {
  testWidgets(
    'live deletion requires password and stays signed in after rejection',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final portal = _PasswordProtectedPortal();
      final state = AppState()..customerRepository = portal;
      addTearDown(state.dispose);
      final s = await AppLocalizations.delegate.load(const Locale('uz'));
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      final navigator = tester.state<NavigatorState>(
        find.byType(Navigator).first,
      );
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            body: ProfileTab(
              portal: portal,
              state: state,
              onLogout: () {
                state.logout();
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text(s.deleteAccount), 200,
        scrollable: find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first);
      await tester.tap(find.text(s.deleteAccount).last);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, s.deleteAccount).last);
      await tester.pumpAndSettle();
      expect(portal.attempts, isEmpty);
      await tester.enterText(find.byType(TextField), 'wrong-password');
      await tester.tap(find.widgetWithText(FilledButton, s.deleteAccount).last);
      await tester.pumpAndSettle();
      expect(portal.attempts, ['wrong-password']);
      expect(state.customerRepository, same(portal));
      expect(find.text(s.credentialsError), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'synthetic-password');
      await tester.tap(find.widgetWithText(FilledButton, s.deleteAccount).last);
      await tester.pumpAndSettle();
      expect(portal.attempts, ['wrong-password', 'synthetic-password']);
      expect(state.customerRepository, isNull);
    },
  );
}
