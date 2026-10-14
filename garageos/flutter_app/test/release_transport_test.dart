import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/design/theme.dart';
import 'package:garageos_staff/design/widgets.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';

void main() {
  testWidgets('HTTPS rejection is visible in the selected language', (
    tester,
  ) async {
    late String failure;
    try {
      ApiClient.validateAddress(
        'http://service.example/api/v1',
        requireHttps: true,
      );
      fail('HTTP must be rejected');
    } on AppFailure catch (error) {
      failure = error.message;
    }
    for (final (language, message) in [
      ('uz', 'HTTPS API manzilini kiriting.'),
      ('en', 'Enter an HTTPS API address.'),
      ('ru', 'Введите HTTPS-адрес API.'),
    ]) {
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(language),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: garageTheme(Brightness.light),
          home: Scaffold(body: ErrorNotice(failure)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(message), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  test(
    'secure policy rejects HTTP before login credentials reach transport',
    () {
      var calls = 0;
      final transport = MockClient((request) async {
        calls++;
        return http.Response('{}', 200);
      });
      expect(
        () => ApiClient(
          'http://service.example/api/v1',
          client: transport,
          requireHttps: true,
        ),
        throwsA(isA<AppFailure>()),
      );
      expect(calls, 0);
      transport.close();
    },
  );

  test(
    'secure HTTPS login sends credentials once without following redirects',
    () async {
      final requests = <http.Request>[];
      final api = ApiClient(
        'https://service.example/api/v1',
        requireHttps: true,
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(
            '{"access_token":"fixture"}',
            302,
            headers: {'location': 'http://service.example/api/v1/auth/login'},
          );
        }),
      );
      await expectLater(
        api.request(
          'POST',
          '/auth/login',
          authenticated: false,
          body: {
            'email': 'public-fixture@example.com',
            'password': 'public-fixture',
          },
        ),
        throwsA(isA<AppFailure>().having((e) => e.status, 'redirect', 302)),
      );
      expect(requests.length, 1);
      expect(requests.single.url.scheme, 'https');
      expect(requests.single.followRedirects, isFalse);
      expect(jsonDecode(requests.single.body)['password'], 'public-fixture');
      api.close();
    },
  );

  test('redirect after token refresh remains an uncertain mutation with its request key', () async {
    final requests = <http.Request>[];
    final api = ApiClient(
      'https://service.example/api/v1',
      requireHttps: true,
      client: MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/auth/refresh')) {
          return http.Response(
            '{"access_token":"new","refresh_token":"new-refresh"}',
            200,
          );
        }
        if (request.headers['Authorization'] == 'Bearer old') {
          return http.Response('{}', 401);
        }
        return http.Response(
          '{"ok":true}',
          307,
          headers: {
            'location': 'http://service.example/api/v1/invoices/i/payments',
          },
        );
      }),
    );
    api.accessToken = 'old';
    api.refreshToken = 'refresh';
    await expectLater(
      api.request(
        'POST',
        '/invoices/i/payments',
        body: {'amount': 150000},
        idempotencyKey: 'same-public-key',
      ),
      throwsA(
        isA<AppFailure>()
            .having((e) => e.status, 'redirect', 307)
            .having((e) => e.uncertain, 'uncertain payment', isTrue),
      ),
    );
    expect(requests.length, 3);
    expect(
      requests.every((r) => r.url.scheme == 'https' && !r.followRedirects),
      isTrue,
    );
    final mutations = requests
        .where((r) => r.url.path.endsWith('/payments'))
        .toList();
    expect(mutations.length, 2);
    expect(
      mutations.map((r) => r.headers['Idempotency-Key']),
      everyElement('same-public-key'),
    );
    api.close();
  });

  test('development HTTP and successful secure HTTPS remain usable', () async {
    final developer = ApiClient(
      'http://10.0.2.2:8000/api/v1',
      client: MockClient((r) async => http.Response('{}', 200)),
    );
    expect(
      await developer.request('GET', '/probe', authenticated: false),
      <String, dynamic>{},
    );
    developer.close();
    final secure = ApiClient(
      'https://service.example/api/v1',
      requireHttps: true,
      client: MockClient((r) async => http.Response('{"ok":true}', 200)),
    );
    expect(await secure.request('GET', '/probe', authenticated: false), {
      'ok': true,
    });
    secure.close();
  });
}
