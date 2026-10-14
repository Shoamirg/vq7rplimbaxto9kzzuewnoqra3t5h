import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/customer_repository.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('customer booking reuses its idempotency key after an unknown response', () async {
    final bookingKeys = <String>[];
    var bookingAttempts = 0;
    Future<http.Response> respond(http.Request request) async {
      if (request.url.path.endsWith('/customer/auth/login')) {
        return http.Response(
          jsonEncode({'access_token': 'access', 'refresh_token': 'refresh'}),
          200,
        );
      }
      if (request.url.path.endsWith('/customer/me')) {
        return http.Response(
          jsonEncode({'full_name': 'Ali', 'garage': {'name': 'GarageOS'}}),
          200,
        );
      }
      if (request.url.path.endsWith('/customer/appointments')) {
        bookingAttempts++;
        bookingKeys.add(request.headers['Idempotency-Key']!);
        if (bookingAttempts == 1) {
          return http.Response(jsonEncode({'detail': 'temporary failure'}), 503);
        }
        return http.Response(jsonEncode({'id': 'appointment-1', 'status': 'pending'}), 200);
      }
      return http.Response('{}', 404);
    }
    SharedPreferences.setMockInitialValues({});

    final repository = await CustomerRepository.login(
      'http://garage.test/api/v1',
      'customer@example.test',
      'not-a-real-password',
      onExpired: () {},
      client: MockClient(respond),
    );
    final request = {
      'vehicleId': 'vehicle-1',
      'service': 'Brake inspection',
      'date': DateTime(2032, 10, 2),
      'time': '10:30',
    };

    await expectLater(
      repository.bookAppointment(
        vehicleId: request['vehicleId'] as String,
        service: request['service'] as String,
        date: request['date'] as DateTime,
        time: request['time'] as String,
      ),
      throwsA(isA<AppFailure>().having((error) => error.uncertain, 'uncertain', isTrue)),
    );
    repository.close();

    // A new repository instance models an app restart after the reply was lost.
    final restarted = await CustomerRepository.login(
      'http://garage.test/api/v1',
      'customer@example.test',
      'not-a-real-password',
      onExpired: () {},
      client: MockClient(respond),
    );
    final result = await restarted.bookAppointment(
      vehicleId: request['vehicleId'] as String,
      service: request['service'] as String,
      date: request['date'] as DateTime,
      time: request['time'] as String,
    );

    expect(result['status'], 'pending');
    expect(bookingKeys, hasLength(2));
    expect(bookingKeys.first, bookingKeys.last);
    expect(bookingKeys.first, matches(RegExp(r'^[0-9a-f-]{36}$')));
    restarted.close();
  });
}
