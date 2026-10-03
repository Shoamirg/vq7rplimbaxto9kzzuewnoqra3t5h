import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('screen readers receive plate labels in the selected language', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final state = AppState()..demo();
    addTearDown(state.dispose);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(GarageApp(state: state));
    await tester.pumpAndSettle();
    for (final (language, prefix) in [
      ('English', 'License plate:'),
      ('Русский', 'Госномер:'),
    ]) {
      await tester.tap(find.byKey(const ValueKey('language-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(language));
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(RegExp('$prefix 01 A 123 BC')),
        findsOneWidget,
      );
    }
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('storage failure is visible and a later language save recovers', (
    tester,
  ) async {
    final store = _FailingPreferencesStore();
    final original = SharedPreferencesStorePlatform.instance;
    SharedPreferencesStorePlatform.instance = store;
    addTearDown(() => SharedPreferencesStorePlatform.instance = original);
    await tester.pumpWidget(const GarageApp());
    await tester.pumpAndSettle();
    expect(find.text('Xush kelibsiz'), findsOneWidget);
    store.failReads = false;
    await tester.tap(find.byKey(const ValueKey('language-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(tester.takeException(), isNull);
    store.failWrites = false;
    await tester.tap(find.byKey(const ValueKey('language-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Русский'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    SharedPreferences.resetStatic();
    await tester.pumpWidget(const GarageApp());
    await tester.pumpAndSettle();
    expect(find.text('Добро пожаловать'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('only untouched service and invoice defaults follow language', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final state = AppState()..demo();
    addTearDown(state.dispose);
    await tester.pumpWidget(GarageApp(state: state));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Dilnoza Saidova'),
      180,
      scrollable: find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      ),
    );
    await tester.ensureVisible(find.text('Dilnoza Saidova'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dilnoza Saidova'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Ishni tugatish'));
    await tester.pumpAndSettle();
    Future<void> select(String language) async {
      await tester.tap(find.byKey(const ValueKey('language-menu')).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text(language));
      await tester.pumpAndSettle();
    }

    await select('English');
    expect(find.text('General service'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Custom service');
    await select('Русский');
    expect(find.text('Custom service'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Работа завершена'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Создать счёт'));
    await tester.pumpAndSettle();
    await select('English');
    expect(find.text('Service work'), findsOneWidget);
    expect(find.text('Enter a valid price.'), findsNothing);
    // Language changes alone must not mark a pristine invoice as edited.
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved changes'), findsNothing);
    await tester.tap(find.widgetWithText(FilledButton, 'Create invoice'));
    await tester.pumpAndSettle();
    // Even an edit matching the generated value becomes user-owned data.
    await tester.enterText(find.byType(TextFormField).first, 'Custom line');
    await tester.enterText(find.byType(TextFormField).first, 'Service work');
    await select('Русский');
    expect(find.text('Service work'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('staff can switch language without losing sign-in edits', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const GarageApp());
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextFormField).first,
      'staff@example.com',
    );
    await tester.tap(find.byKey(const ValueKey('language-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('staff@example.com'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('language selection survives a new app session', (tester) async {
    await tester.pumpWidget(const GarageApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('language-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Русский'));
    await tester.pumpAndSettle();
    expect(find.text('Добро пожаловать'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(const GarageApp());
    await tester.pumpAndSettle();
    expect(find.text('Добро пожаловать'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'language change keeps the selected tab, search and open form edits',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final state = AppState()..demo();
      addTearDown(state.dispose);
      await tester.pumpWidget(GarageApp(state: state));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('language-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Customers'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Aziz');
      await tester.pumpAndSettle(const Duration(milliseconds: 400));
      expect(find.text('Aziz Karimov'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('language-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Русский'));
      await tester.pumpAndSettle();
      expect(find.text('Поиск клиентов'), findsOneWidget);
      expect(find.text('Aziz'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Новый клиент'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextFormField).first,
        'Review customer',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Сохранить'));
      await tester.pumpAndSettle();
      expect(find.text('Введите корректный номер телефона.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('language-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      expect(find.text('Review customer'), findsOneWidget);
      expect(find.text('Enter a valid phone number.'), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved changes'), findsOneWidget);
      await tester.tap(find.text('Leave without saving'));
      await tester.pumpAndSettle();
      expect(find.text('Search customers'), findsOneWidget);
      expect(find.text('Aziz'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

class _FailingPreferencesStore extends InMemorySharedPreferencesStore {
  _FailingPreferencesStore() : super.empty();
  bool failReads = true, failWrites = true;
  @override
  Future<Map<String, Object>> getAll() async {
    if (failReads) throw StateError('Browser storage is unavailable');
    return super.getAll();
  }

  @override
  Future<bool> setValue(String valueType, String key, Object value) async {
    if (failWrites) throw StateError('Browser storage quota exceeded');
    return super.setValue(valueType, key, value);
  }
}
