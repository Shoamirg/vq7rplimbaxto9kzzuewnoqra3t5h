import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

class HeldLogoutRepository extends DemoRepository {
  final result = Completer<LogoutOutcome>();
  bool closed = false;
  @override
  Future<LogoutOutcome> logout() => result.future;
  @override
  void close() => closed = true;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('logout detaches the old identity before server reply; late outcome cannot override a new session', () async {
    final repo = HeldLogoutRepository();
    final state = AppState()..repository = repo;
    final logout = state.logout();
    expect(state.repository, isNull);
    state.demo();
    final current = state.repository;
    repo.result.complete(LogoutOutcome.unconfirmed);
    await logout;
    expect(repo.closed, isTrue);
    expect(state.repository, same(current));
    expect(state.sessionNotice, isNull);
    state.dispose();
  });
  for (final (locale, label) in [
    (
      'uz',
      'Qurilmada hisobdan chiqildi. Serverdagi sessiya bekor qilingani tasdiqlanmadi.',
    ),
    (
      'en',
      'Signed out on this device. Server session revocation could not be confirmed.',
    ),
    (
      'ru',
      'Вы вышли на этом устройстве. Отзыв сеанса на сервере не подтверждён.',
    ),
  ]) {
    testWidgets(
      'unconfirmed server logout leaves the protected app and explains the outcome in $locale',
      (tester) async {
        final repo = HeldLogoutRepository();
        final state = AppState()
          ..repository = repo
          ..locale = Locale(locale);
        addTearDown(state.dispose);
        await tester.pumpWidget(GarageApp(state: state));
        await tester.pumpAndSettle();
        final logout = state.logout();
        await tester.pumpAndSettle();
        expect(find.byType(NavigationBar), findsNothing);
        repo.result.complete(LogoutOutcome.unconfirmed);
        await logout;
        await tester.pumpAndSettle();
        expect(find.text(label), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
