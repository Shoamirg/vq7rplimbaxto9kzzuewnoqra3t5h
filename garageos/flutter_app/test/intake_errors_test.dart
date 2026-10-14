import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/design/theme.dart';
import 'package:garageos_staff/design/widgets.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/ui/billing.dart';
import 'package:garageos_staff/ui/booking.dart';
import 'package:garageos_staff/ui/customers.dart';

class DelayedCatalog extends DemoRepository {
  Completer<List<CarModel>> response = Completer<List<CarModel>>();
  @override
  Future<List<CarModel>> catalog() => response.future;
}

class DelayedCars extends DemoRepository {
  final responses = <String, Completer<List<Car>>>{
    'c1': Completer<List<Car>>(),
    'c2': Completer<List<Car>>(),
  };
  @override
  Future<List<Car>> cars(String customerId) => responses[customerId]!.future;
}

Widget host(Widget screen) => MaterialApp(
  locale: const Locale('uz'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  theme: garageTheme(Brightness.light),
  home: screen,
);

void main() {
  testWidgets('vehicle Save waits for catalog; error can be retried', (
    tester,
  ) async {
    final repo = DelayedCatalog();
    await tester.pumpWidget(
      host(
        CarForm(
          repository: repo,
          customer: const Customer('c1', 'Aziz', '+998901234567'),
        ),
      ),
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Saqlash'))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Saqlash'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    repo.response.completeError(const AppFailure('Katalog yuklanmadi.'));
    await tester.pumpAndSettle();
    expect(find.text('Katalog yuklanmadi.'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Saqlash'))
          .onPressed,
      isNull,
    );
    repo.response = Completer<List<CarModel>>();
    await tester.tap(find.text('Qayta urinish'));
    await tester.pump();
    repo.response.complete(const [CarModel('m1', 'Chevrolet Cobalt')]);
    await tester.pumpAndSettle();
    expect(find.byType(Form), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Saqlash'))
          .onPressed,
      isNotNull,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('invalid quantity stays editable without crashing the invoice', (
    tester,
  ) async {
    final repo = DemoRepository();
    await tester.pumpWidget(
      host(BillForm(repository: repo, work: await repo.work('w3'))),
    );
    await tester.pumpAndSettle();
    final price = find.widgetWithText(TextFormField, 'Birlik narxi');
    final quantity = find.widgetWithText(TextFormField, 'Miqdor');
    await tester.ensureVisible(price);
    await tester.enterText(price, '1');
    await tester.ensureVisible(quantity);
    await tester.enterText(quantity, '1e308');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.widgetWithText(FilledButton, 'Hisob yaratish'));
    await tester.pumpAndSettle();
    expect(find.text('Musbat miqdorni kiriting.'), findsOneWidget);
    await tester.enterText(quantity, '2');
    await tester.pumpAndSettle();
    expect(find.text('2 soʻm'), findsWidgets);
    await tester.enterText(quantity, '99999999.99');
    await tester.ensureVisible(price);
    await tester.enterText(price, '99999999.99');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.widgetWithText(FilledButton, 'Hisob yaratish'));
    await tester.pumpAndSettle();
    expect(
      find.text('Qator summasi 100 million soʻmdan kam boʻlsin.'),
      findsOneWidget,
    );
    expect((await repo.bills()).items, isEmpty);
  });

  testWidgets('unsaved customer survives Back until discard is confirmed', (
    tester,
  ) async {
    final repo = DemoRepository();
    await tester.pumpWidget(
      host(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () =>
                  openPage(context, CustomerForm(repository: repo)),
              child: const Text('Ochish'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ochish'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Ism va familiya'),
      'Test mijoz',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Oʻzgarishlar saqlanmadi'), findsOneWidget);
    await tester.tap(find.text('Davom etish'));
    await tester.pumpAndSettle();
    expect(find.text('Test mijoz'), findsOneWidget);
    await tester.tap(find.text('Bekor qilish'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Saqlamasdan chiqish'));
    await tester.pumpAndSettle();
    expect(find.text('Ochish'), findsOneWidget);
    expect((await repo.customers(query: 'Test mijoz')).total, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('validation focuses the first invalid field', (tester) async {
    await tester.pumpWidget(host(CustomerForm(repository: DemoRepository())));
    await tester.tap(find.widgetWithText(FilledButton, 'Saqlash'));
    await tester.pumpAndSettle();
    expect(find.text('Bu maydonni toʻldiring.'), findsOneWidget);
    expect(
      tester
          .widget<EditableText>(find.byType(EditableText).first)
          .focusNode
          .hasFocus,
      isTrue,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('old car response cannot replace the selected customer cars', (
    tester,
  ) async {
    final repo = DelayedCars();
    await tester.pumpWidget(
      host(
        BookingScreen(
          repository: repo,
          customer: const Customer('c1', 'Aziz Karimov', '+998901234567'),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Mijozni oʻzgartirish'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Dilnoza Saidova'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    repo.responses['c2']!.complete(const [
      Car('v2', 'c2', 'Chevrolet Gentra', '01R482MA', 2023, 100),
    ]);
    await tester.pump();
    repo.responses['c1']!.complete(const [
      Car('v1', 'c1', 'Chevrolet Cobalt', '01A123BC', 2021, 100),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Chevrolet Gentra'), findsOneWidget);
    expect(find.text('Chevrolet Cobalt'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
