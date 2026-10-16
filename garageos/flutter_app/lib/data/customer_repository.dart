import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_client.dart';
import '../domain/models.dart';
import 'pending_idempotency.dart';

abstract interface class CustomerBookingSource {
  Future<List<CustomerPortalVehicle>> vehicles();
  Future<DateTime> bookingToday();
  Future<Json> bookAppointment({
    required String vehicleId,
    required String service,
    required DateTime date,
    required String time,
  });
}

class CustomerPortalVehicle {
  const CustomerPortalVehicle({required this.id, required this.label});
  factory CustomerPortalVehicle.fromJson(Json json) => CustomerPortalVehicle(
    id: json['id'],
    label: json['label'],
  );

  final String id;
  final String label;
}

/// Customer portal repository. Mutations are limited to owned-vehicle booking.
class CustomerRepository implements CustomerBookingSource {
  CustomerRepository._(this._api, this.name, this.garageName);
  final ApiClient _api;
  final String name, garageName;
  static Future<CustomerRepository> login(
    String address,
    String email,
    String password, {
    required void Function() onExpired,
    http.Client? client,
  }) async {
    final api = ApiClient(
      address,
      client: client,
      refreshPath: '/customer/auth/refresh',
    );
    try {
      final tokens = await api.request(
        'POST',
        '/customer/auth/login',
        authenticated: false,
        body: {'email': email.trim(), 'password': password},
      );
      api.accessToken = tokens['access_token'];
      api.refreshToken = tokens['refresh_token'];
      final profile = await api.request('GET', '/customer/me');
      api.onExpired = onExpired;
      return CustomerRepository._(
        api,
        profile['full_name'],
        profile['garage']['name'],
      );
    } catch (_) {
      api.close();
      rethrow;
    }
  }

  Future<PageData<Json>> history(
    String kind, {
    String query = '',
    int page = 1,
  }) async {
    final data = await _api.request(
      'GET',
      '/customer/history/$kind',
      query: {'q': query, 'page': '$page'},
    );
    return PageData(
      (data['items'] as List).map((e) => Json.from(e)).toList(),
      data['total'],
      data['page'],
    );
  }

  Future<Json> invoice(String id) async =>
      Json.from(await _api.request('GET', '/customer/history/invoices/$id'));

  @override
  Future<List<CustomerPortalVehicle>> vehicles() async {
    final data = await _api.request('GET', '/customer/vehicles');
    return (data['vehicles'] as List)
        .map((value) => CustomerPortalVehicle.fromJson(Json.from(value)))
        .toList();
  }

  @override
  Future<DateTime> bookingToday() async {
    final data = await _api.request('GET', '/customer/appointments/today');
    return civilDate(data['today']);
  }

  @override
  Future<Json> bookAppointment({
    required String vehicleId,
    required String service,
    required DateTime date,
    required String time,
  }) async {
    final request = <String, dynamic>{
      'vehicle_id': vehicleId,
      'service': service.trim(),
      'date': dateKey(date),
      'time': time,
    };
    final entries = request.entries.toList()
      ..sort((left, right) => left.key.compareTo(right.key));
    final fingerprint = jsonEncode(Map.fromEntries(entries));
    const scope = 'customer-booking';
    final key = await PendingIdempotency.getOrCreate(scope, fingerprint);
    try {
      final response = await _api.request(
        'POST',
        '/customer/appointments',
        body: request,
        idempotencyKey: key,
      );
      final result = Json.from(response);
      if (result['status'] != 'pending' || result['id'] is! String) {
        throw const AppFailure(
          'Booking response could not be verified.',
          uncertain: true,
        );
      }
      await PendingIdempotency.clear(scope, fingerprint);
      return result;
    } on AppFailure catch (error) {
      if (!error.uncertain) await PendingIdempotency.clear(scope, fingerprint);
      rethrow;
    }
  }

  Future<LogoutOutcome> logout() => _api.logout();
  void close() => _api.close();
}
