import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/payment_store.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/domain/models.dart';

http.Response json(Object value, [int status = 200]) => http.Response(
  jsonEncode(value),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Json invoice({int paid = 0}) => {
  'id': 'invoice-1',
  'code': 'INV-1',
  'customer_id': 'c1',
  'customer_name': 'Aziz',
  'currency': 'UZS',
  'status': paid == 300000 ? 'paid' : 'issued',
  'total': 300000,
  'amount_paid': paid,
  'balance': 300000 - paid,
  'subtotal': 300000,
  'tax_total': 0,
  'discount_total': 0,
  'line_items': [],
  'payments': [],
};

void main() {
  test('401 refresh is shared across simultaneous requests; mutation key is unchanged', () async {
    var refreshCount = 0;
    final oldRequests = Completer<void>();
    var oldCount = 0;
    final client = ApiClient(
      'http://localhost:8000/api/v1',
      client: MockClient((r) async {
        if (r.url.path.endsWith('/auth/refresh')) {
          refreshCount++;
          return json({'access_token': 'new', 'refresh_token': 'refresh-new'});
        }
        if (r.headers['Authorization'] == 'Bearer old') {
          oldCount++;
          if (oldCount == 2) oldRequests.complete();
          await oldRequests.future;
          return json({'code': 'TOKEN_EXPIRED'}, 401);
        }
        expect(r.headers['Authorization'], 'Bearer new');
        if (r.method == 'POST') {
          expect(r.headers['Idempotency-Key'], 'unchanged-key');
        }
        return json({'ok': true});
      }),
    );
    client.accessToken = 'old';
    client.refreshToken = 'refresh';
    await Future.wait([
      client.request('GET', '/appointments'),
      client.request(
        'POST',
        '/invoices/i/payments',
        body: {'amount': 1},
        idempotencyKey: 'unchanged-key',
      ),
    ]);
    expect(refreshCount, 1);
    client.close();
  });
  test('failed refresh expires session without a recursive retry', () async {
    var expired = 0;
    final api = ApiClient(
      'https://example.test/api/v1',
      client: MockClient((r) async => json({'code': 'INVALID_TOKEN'}, 401)),
    );
    api.accessToken = 'old';
    api.refreshToken = 'invalid';
    api.onExpired = () => expired++;
    await expectLater(
      api.request('GET', '/auth/me'),
      throwsA(isA<AppFailure>()),
    );
    expect(expired, 1);
    expect(api.accessToken, isNull);
    api.close();
  });
  test('unknown payment result retains intent across repository recreation and retry', () async {
    final store = MemoryPaymentStore();
    var calls = 0;
    final keys = <String>[];
    final transport = MockClient((r) async {
      calls++;
      keys.add(r.headers['Idempotency-Key']!);
      if (calls == 1) {
        throw http.ClientException('connection dropped after commit');
      }
      return json(invoice(paid: 300000));
    });
    final api = ApiClient('http://localhost:8000/api/v1', client: transport);
    final repo = LiveRepository(api, paymentStore: store);
    await expectLater(
      repo.pay('invoice-1', const Money(30000000), 'cash', 'same-key'),
      throwsA(isA<AppFailure>().having((e) => e.uncertain, 'uncertain', true)),
    );
    final resumed = LiveRepository(api, paymentStore: store);
    final intent = (await resumed.payments.read('invoice-1'))!;
    final result = await resumed.pay(
      'invoice-1',
      intent.amount,
      intent.method,
      intent.key,
    );
    expect(result.balance.cents, 0);
    expect(keys, ['same-key', 'same-key']);
    expect(await store.read('invoice-1'), isNull);
    api.close();
  });
  test('authoritative rejection clears the intent; storage failure sends no payment', () async {
    var calls = 0;
    final api = ApiClient(
      'https://example.test/api/v1',
      client: MockClient((r) async {
        calls++;
        return json({'code': 'PAYMENT_EXCEEDS_BALANCE'}, 409);
      }),
    );
    final repo = LiveRepository(api);
    await expectLater(
      repo.pay('i', const Money(1), 'cash', 'key'),
      throwsA(isA<AppFailure>()),
    );
    expect(await repo.payments.read('i'), isNull);
    repo.payments = BrokenStore();
    await expectLater(
      repo.pay('i', const Money(1), 'cash', 'key'),
      throwsA(isA<AppFailure>()),
    );
    expect(calls, 1);
    api.close();
  });
}

class BrokenStore extends MemoryPaymentStore {
  @override
  Future<void> write(String invoiceId, PendingPayment intent) async {
    throw const AppFailure('storage unavailable', uncertain: true);
  }
}
