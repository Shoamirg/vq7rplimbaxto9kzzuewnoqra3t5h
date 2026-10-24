import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_client.dart';
import 'customer_portal.dart';
import '../domain/models.dart';
import '../domain/portal.dart';
import 'pending_idempotency.dart';

export 'customer_portal.dart';

/// Live customer portal. Reads the customer's own vehicles, visits and
/// invoices; mutations are limited to owned-vehicle booking. Health,
/// estimates, messages and roadside report [AppFailure.unavailable] until
/// they are wired to the customer API.
class CustomerRepository implements CustomerPortal {
  CustomerRepository._(this._api, this.name, this.garageName, this._profile);
  final ApiClient _api;
  final Json _profile;
  @override
  final String name, garageName;
  @override
  bool get isDemo => false;
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
        Json.from(profile),
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

  @override
  Future<CustomerProfile> profile() async {
    final garage = Json.from(_profile['garage'] ?? const {});
    return CustomerProfile(
      name: name,
      phone: _profile['phone'],
      email: _profile['email'],
      garage: GarageContact(
        name: garageName,
        phone: garage['phone'],
        address: garage['address'],
      ),
    );
  }

  @override
  Future<HomeSummary> home() async {
    final visits = await appointments();
    final upcoming = visits.where((a) => a.upcoming).toList()
      ..sort((a, b) => '${a.date}${a.time}'.compareTo('${b.date}${b.time}'));
    return HomeSummary(
      firstName: name.trim().split(RegExp(r'\s+')).first,
      garage: garageName,
      next: upcoming.isEmpty ? null : upcoming.first,
    );
  }

  @override
  Future<List<PortalVehicle>> cars() async {
    final page = await history('vehicles');
    return [
      for (final item in page.items)
        () {
          final parts = '${item['detail'] ?? ''}'.split(' · ');
          final plate = parts.first.trim();
          return PortalVehicle(
            id: item['id'],
            label: item['title'],
            plate: plate.isEmpty || plate == '—' ? null : plate,
            year: parts.length > 1 ? int.tryParse(parts[1].trim()) : null,
          );
        }(),
    ];
  }

  @override
  Future<VehicleDetail> car(String id) async =>
      VehicleDetail((await cars()).firstWhere((c) => c.id == id));

  @override
  Future<ServicePassport> passport(String vehicleId) =>
      throw const AppFailure.unavailable();

  @override
  Future<List<PortalAppointment>> appointments() async {
    final page = await history('appointments');
    final result = <PortalAppointment>[];
    for (final item in page.items) {
      final match = RegExp(
        r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})',
      ).firstMatch('${item['title']}');
      if (match == null) continue;
      result.add(
        PortalAppointment(
          id: item['id'],
          date: civilDate(item['appointment_local_date'] ?? match[1]!),
          time: match[2]!,
          status: WorkStatus.parse('${item['detail']}'),
        ),
      );
    }
    return result;
  }

  @override
  Future<BillingOverview> billing() async {
    final page = await history('invoices');
    final invoices = [
      for (final item in page.items)
        PortalInvoice(
          id: item['id'],
          code: item['title'],
          status: '${item['detail']}',
          currency: item['currency'] ?? 'UZS',
          total: Money.fromApi(item['total']),
          balance: Money.fromApi(item['balance']),
          paid: Money(
            Money.fromApi(item['total']).cents -
                Money.fromApi(item['balance']).cents,
          ),
        ),
    ];
    return BillingOverview(
      owed: Money(invoices.fold(0, (sum, i) => sum + i.balance.cents)),
      estimates: const [],
      invoices: invoices,
    );
  }

  /// The customer-facing invoice document exactly as the API returns it.
  Future<Json> invoiceJson(String id) async =>
      Json.from(await _api.request('GET', '/customer/history/invoices/$id'));

  @override
  Future<PortalInvoice> invoice(String id) async {
    final data = await invoiceJson(id);
    final total = Money.fromApi(data['total']);
    final balance = Money.fromApi(data['balance']);
    return PortalInvoice(
      id: id,
      code: data['code'],
      status: data['status'] ?? (balance.cents == 0 ? 'paid' : 'issued'),
      currency: data['currency'] ?? 'UZS',
      total: total,
      balance: balance,
      paid: Money(total.cents - balance.cents),
      lines: [
        for (final line in data['lines'] as List? ?? const [])
          () {
            final quantity = (line['quantity'] as num).toDouble();
            final total = Money.fromApi(line['total']);
            // The customer document carries line totals; derive the unit
            // price rather than showing zero.
            return BillLine(
              line['description'],
              quantity,
              line['unit_price'] != null
                  ? Money.fromApi(line['unit_price'])
                  : Money(quantity == 0 ? 0 : (total.cents / quantity).round()),
              recordedTotal: total,
            );
          }(),
      ],
      payments: [
        for (final payment in data['payments'] as List? ?? const [])
          Receipt(
            '${payment['id'] ?? payment['date']}',
            Money.fromApi(payment['amount']),
            payment['method'],
            DateTime.tryParse(payment['date'] ?? ''),
            kind: payment['kind'] ?? 'payment',
          ),
      ],
    );
  }

  @override
  Future<Estimate> estimate(String id) => throw const AppFailure.unavailable();
  @override
  Future<Estimate> decideEstimate(String id, {required bool approve}) =>
      throw const AppFailure.unavailable();
  @override
  Future<String> askAboutEstimate(String id, String question) =>
      throw const AppFailure.unavailable();
  @override
  Future<List<Thread>> threads() => throw const AppFailure.unavailable();
  @override
  Future<List<ChatMessage>> messages(String threadId) =>
      throw const AppFailure.unavailable();
  @override
  Future<ChatMessage> send(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) => throw const AppFailure.unavailable();
  @override
  Future<RoadsideCase> requestRoadside({
    required String vehicleId,
    required RoadsideProblem problem,
    required GeoPoint location,
  }) => throw const AppFailure.unavailable();
  @override
  Future<RoadsideCase> roadside(String id) =>
      throw const AppFailure.unavailable();
  @override
  Future<void> changePassword(String current, String next) =>
      throw const AppFailure.unavailable();
  @override
  Future<void> deleteAccount() => throw const AppFailure.unavailable();

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
  Future<List<String>> slots(DateTime date) async => standardSlots();

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

  @override
  Future<LogoutOutcome> logout() => _api.logout();
  @override
  void close() => _api.close();
}
