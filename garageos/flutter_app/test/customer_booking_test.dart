import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/customer_repository.dart';
import 'package:garageos_staff/design/theme.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/ui/customer_booking.dart';

import 'support/fonts.dart';

class FakeCustomerBookingRepository implements CustomerBookingSource {
  String? vehicleId;
  String? service;
  DateTime? date;
  String? time;
  Object? bookingError;

  @override
  Future<DateTime> bookingToday() async => DateTime(2032, 10, 2);

  @override
  Future<Json> bookAppointment({
    required String vehicleId,
    required String service,
    required DateTime date,
    required String time,
  }) async {
    this.vehicleId = vehicleId;
    this.service = service;
    this.date = date;
    this.time = time;
    if (bookingError != null) throw bookingError!;
    return {"id": "appointment-1", "status": "pending"};
  }

  @override
  Future<List<CustomerPortalVehicle>> vehicles() async => const [
    CustomerPortalVehicle(id: "vehicle-1", label: "Cobalt · 01A123BC"),
    CustomerPortalVehicle(id: "vehicle-2", label: "Damas · 01B456CD"),
  ];
}

Widget host(FakeCustomerBookingRepository repository, String locale) => MaterialApp(
  locale: Locale(locale),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  theme: garageTheme(Brightness.light),
  home: Builder(
    builder: (context) => Scaffold(
      body: Center(
        child: TextButton(
          onPressed: () => Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => CustomerBookingScreen(repository: repository),
            ),
          ),
          child: const Text("Open booking"),
        ),
      ),
    ),
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadGarageFonts);

  testWidgets("customer booking sends an owned vehicle and local wall time", (tester) async {
    final repository = FakeCustomerBookingRepository();
    await tester.pumpWidget(host(repository, "uz"));
    await tester.tap(find.text("Open booking"));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), "Brake inspection");
    await tester.tap(find.text("So‘rov yuborish"));
    await tester.pumpAndSettle();

    expect(repository.vehicleId, "vehicle-1");
    expect(repository.service, "Brake inspection");
    expect(repository.date, DateTime(2032, 10, 2));
    expect(repository.time, "10:00");
    expect(tester.takeException(), isNull);
  });

  testWidgets("uncertain booking keeps the form open for safe retry", (tester) async {
    final repository = FakeCustomerBookingRepository()
      ..bookingError = const AppFailure("Timed out", uncertain: true);
    await tester.pumpWidget(host(repository, "en"));
    await tester.tap(find.text("Open booking"));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), "Oil change");
    await tester.tap(find.text("Send request"));
    await tester.pumpAndSettle();

    expect(find.textContaining("Retry this form"), findsOneWidget);
    expect(find.byType(CustomerBookingScreen), findsOneWidget);
    expect(repository.service, "Oil change");
  });
}
