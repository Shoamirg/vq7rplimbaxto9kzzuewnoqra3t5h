import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../domain/models.dart';
import 'api_client.dart';

class PendingPayment {
  const PendingPayment(this.amount, this.method, this.key);
  final Money amount;
  final String method, key;
  Json toJson() => {'cents': amount.cents, 'method': method, 'key': key};
  factory PendingPayment.fromJson(Json json) =>
      PendingPayment(Money(json['cents']), json['method'], json['key']);
}

abstract class PaymentStore {
  Future<PendingPayment?> read(String invoiceId);
  Future<void> write(String invoiceId, PendingPayment intent);
  Future<void> clear(String invoiceId);
}

class MemoryPaymentStore extends PaymentStore {
  final values = <String, PendingPayment>{};
  @override
  Future<PendingPayment?> read(String invoiceId) async => values[invoiceId];
  @override
  Future<void> write(String invoiceId, PendingPayment intent) async {
    values[invoiceId] = intent;
  }

  @override
  Future<void> clear(String invoiceId) async {
    values.remove(invoiceId);
  }
}

/// Persists only payment amount/method/request UUID. No credentials or tokens.
/// Scope includes server, authenticated user and tenant, so another account
/// cannot resume this account's request.
class DevicePaymentStore extends PaymentStore {
  DevicePaymentStore(this.scope, {SharedPreferencesAsync? preferences})
    : preferences = preferences ?? SharedPreferencesAsync();
  final String scope;
  final SharedPreferencesAsync preferences;
  String _key(String id) => 'garageos.pending-payment/$scope/$id';
  @override
  Future<PendingPayment?> read(String invoiceId) async {
    try {
      final raw = await preferences.getString(_key(invoiceId));
      return raw == null ? null : PendingPayment.fromJson(jsonDecode(raw));
    } catch (_) {
      throw const AppFailure(
        'Oldingi toʻlov soʻrovini oʻqib boʻlmadi. Hisob tarixini tekshiring.',
        uncertain: true,
      );
    }
  }

  @override
  Future<void> write(String invoiceId, PendingPayment intent) async {
    try {
      await preferences.setString(_key(invoiceId), jsonEncode(intent.toJson()));
    } catch (_) {
      throw const AppFailure(
        'Toʻlov soʻrovini qurilmada saqlab boʻlmadi. Qayta urinib koʻring.',
        uncertain: true,
      );
    }
  }

  @override
  Future<void> clear(String invoiceId) async {
    try {
      await preferences.remove(_key(invoiceId));
    } catch (_) {
      throw const AppFailure(
        'Toʻlov javobi olindi. Soʻrovni yakunlash uchun qayta tekshiring.',
        uncertain: true,
      );
    }
  }
}
