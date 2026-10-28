import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garageos_staff/data/api_client.dart';

void main() {
  for (final command in [
    ('DELETE', '/customer/me'),
    ('POST', '/customer/me/password'),
  ]) {
    test(
      'wrong current password preserves the session for ${command.$1} ${command.$2}',
      () async {
        final paths = <String>[];
        var expired = false;
        final api = ApiClient(
          'https://example.com/api/v1',
          refreshPath: '/customer/auth/refresh',
          client: MockClient((request) async {
            paths.add(request.url.path);
            return http.Response(
              jsonEncode({
                'error': {'code': 'CURRENT_PASSWORD_INVALID'},
              }),
              401,
            );
          }),
        );
        addTearDown(api.close);
        api.accessToken = 'synthetic-access';
        api.refreshToken = 'synthetic-refresh';
        api.onExpired = () => expired = true;
        await expectLater(
          api.request(command.$1, command.$2, body: {'password': 'incorrect'}),
          throwsA(
            isA<AppFailure>().having((e) => e.status, 'challenge status', 401),
          ),
        );
        expect(paths, ['/api/v1${command.$2}']);
        expect(api.accessToken, 'synthetic-access');
        expect(api.refreshToken, 'synthetic-refresh');
        expect(expired, isFalse);
      },
    );
  }
}
