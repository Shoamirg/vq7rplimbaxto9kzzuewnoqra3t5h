import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/data/customer_repository.dart';
import 'package:garageos_staff/data/api_client.dart';

void main() {
  const enabled = bool.fromEnvironment('RUN_LOCAL_PORTAL');
  test(
    'isolated real API: every customer read model decodes the native contract',
    () async {
      final fixture = jsonDecode(
        await File('../../ci-evidence/android-mvp/local-fixture.json')
            .readAsString(),
      );
      final tenant = fixture['tenants'][0];
      final portal = await CustomerRepository.login(
        'http://127.0.0.1:8000/api/v1',
        tenant['customer']['email'],
        fixture['password'],
        onExpired: () {},
      );
      addTearDown(portal.close);
      expect((await portal.profile()).name, isNotEmpty);
      expect((await portal.home()).garage, isNotEmpty);
      final cars = await portal.cars();
      expect(cars, isNotEmpty);
      final detail = await portal.car(cars.first.id);
      expect(detail.vehicle.id, cars.first.id);
      expect(
        detail.categories.map((category) => category.area).toSet().length,
        detail.categories.length,
      );
      expect(
        detail.due
            .where((service) => service.dueKm != null)
            .every((service) => service.dueKm! >= 0),
        isTrue,
      );
      expect((await portal.passport(cars.first.id)).vehicle.id, cars.first.id);
      await portal.billing();
      await portal.appointments();
      final threads = await portal.threads();
      expect(threads, isNotEmpty);
      await portal.messages(threads.first.id);
      final staff = ApiClient('http://127.0.0.1:8000/api/v1');
      addTearDown(staff.close);
      final tokens = await staff.request(
        'POST',
        '/auth/login',
        authenticated: false,
        body: {
          'email': tenant['owner']['email'],
          'password': fixture['password'],
        },
      );
      staff.accessToken = tokens['access_token'];
      staff.refreshToken = tokens['refresh_token'];
      final estimate = await staff.request(
        'POST',
        '/invoices',
        body: {
          'kind': 'estimate',
          'customer_id': tenant['customer']['id'],
          'vehicle_id': cars.first.id,
          'line_items': [
            {
              'description': 'MVP host contract',
              'unit_price': 100,
              'quantity': 1,
            },
          ],
        },
      );
      await staff.request('POST', '/invoices/${estimate['id']}/send');
      final decoded = await portal.estimate(estimate['id']);
      expect(decoded.lines.single.description, 'MVP host contract');
      await staff.request('DELETE', '/invoices/${estimate['id']}');
    },
    skip: !enabled
        ? 'Opt in with RUN_LOCAL_PORTAL and the ignored local fixture.'
        : false,
  );
}
