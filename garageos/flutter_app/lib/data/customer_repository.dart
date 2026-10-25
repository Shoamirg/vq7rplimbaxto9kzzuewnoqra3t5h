import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_client.dart';
import 'customer_portal.dart';
import '../domain/models.dart';
import '../domain/portal.dart';
import 'pending_idempotency.dart';
import 'portal_mapper.dart';
import 'photo_access.dart';
import 'notification_feed.dart';

export 'customer_portal.dart';

/// Live customer portal. Reads the customer's own vehicles, visits and
/// invoices; mutations are limited to owned-vehicle booking. Health,
/// estimates, messages and roadside report [AppFailure.unavailable] until
/// they are wired to the customer API.
class CustomerRepository
    implements CustomerPortal, PhotoAccess, NotificationFeed {
  CustomerRepository._(this._api, this.name, this.garageName, this._profile);
  final ApiClient _api;
  ApiClient get api => _api;
  DateTime _date(dynamic value) =>
      apiDate(value, timeZone: _api.serviceTimeZone);
  Estimate _estimate(Json value) =>
      portalEstimate(value, timeZone: _api.serviceTimeZone);
  PortalInvoice _invoice(Json value) =>
      portalInvoice(value, timeZone: _api.serviceTimeZone);
  Thread _thread(Json value) =>
      portalThread(value, timeZone: _api.serviceTimeZone);
  ChatMessage _message(Json value) =>
      portalMessage(value, timeZone: _api.serviceTimeZone);
  RoadsideCase _roadside(Json value) =>
      portalRoadside(value, timeZone: _api.serviceTimeZone);
  @override
  Future<List<AppNotification>> notifications() async {
    final data = await _api.request('GET', '/customer/home/activity');
    return [
      for (final item in data['items'])
        AppNotification(
          '${item['id']}',
          item['title'] ?? '',
          item['detail'] ?? '',
        ),
    ];
  }

  final Json _profile;
  @override
  final String name, garageName;
  @override
  bool get isDemo => false;
  static Future<CustomerRepository> fromApi(
    ApiClient api, {
    required void Function() onExpired,
  }) async {
    final profile = await api.request('GET', '/customer/me');
    api.serviceTimeZone = profile['garage']['timezone'] ?? 'UTC';
    api.identityScope =
        '${api.base}/customer/${profile['id']}/${profile['garage']['id']}';
    api.onExpired = onExpired;
    return CustomerRepository._(
      api,
      profile['full_name'],
      profile['garage']['name'],
      Json.from(profile),
    );
  }

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
      return await fromApi(api, onExpired: onExpired);
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
    final data = await _api.request('GET', '/customer/home');
    final next = data['next_appointment'];
    final primary = data['primary_vehicle'];
    return HomeSummary(
      firstName: data['greeting'] ?? name.trim().split(RegExp(r'\s+')).first,
      garage: garageName,
      estimate: data['pending_estimate'] == null
          ? null
          : _estimate(Json.from(data['pending_estimate'])),
      next: next == null
          ? null
          : PortalAppointment(
              id: next['id'],
              date: civilDate(
                next['local_date'] ?? '${next['date']}'.substring(0, 10),
              ),
              time: next['time'] ?? '',
              status: WorkStatus.parse(next['status']),
              vehicle: next['vehicle_label'] ?? '',
              service: next['service_type'],
            ),
      vehicle: primary == null ? null : portalVehicle(Json.from(primary)),
      unread: data['latest_message']?['awaiting_you'] == true ? 1 : 0,
      roadside: data['active_roadside'] == null
          ? null
          : _roadside(Json.from(data['active_roadside'])),
    );
  }

  @override
  Future<List<PortalVehicle>> cars() async {
    final data = await _api.request('GET', '/customer/vehicles');
    return [
      for (final item in data['vehicles']) portalVehicle(Json.from(item)),
    ];
  }

  @override
  Future<VehicleDetail> car(String id) async {
    final data = Json.from(
      await _api.request('GET', '/customer/vehicles/$id/health'),
    );
    final vehicle = Json.from(data['vehicle']);
    vehicle['health_score'] = data['overall_score'];
    final timeline = await _api.request(
      'GET',
      '/customer/vehicles/$id/timeline',
    );
    return VehicleDetail(
      portalVehicle(vehicle),
      categories: [
        for (final category in data['categories'] ?? const [])
          HealthCategory(switch ('${category['name']}'.toLowerCase()) {
            'engine' || 'engine & fluids' => HealthArea.engine,
            'brakes' => HealthArea.brakes,
            'tires' || 'tyres' || 'tires & wheels' => HealthArea.tires,
            'transmission' => HealthArea.transmission,
            _ => HealthArea.general,
          }, (category['score'] as num).round()),
      ],
      due: [
        for (final service in data['services'] ?? const [])
          if (service['is_due'] == true)
            DueService(
              '${service['service_type']}',
              service['priority'] == 'high'
                  ? HealthState.overdue
                  : HealthState.dueSoon,
              dueKm: service['remaining_km'] is num
                  ? ((vehicle['current_km'] as num? ?? 0) +
                            (service['remaining_km'] as num))
                        .round()
                  : null,
            ),
      ],
      visits: [
        for (final event in timeline['events'] ?? const [])
          if (event['type'] == 'service')
            ServiceVisit(
              date: _date(event['date']),
              title: event['title'] ?? '',
              km: event['km'],
              garage: garageName,
              total: event['cost'] == null
                  ? null
                  : Money.fromApi(event['cost']),
            ),
      ],
    );
  }

  @override
  Future<ServicePassport> passport(String vehicleId) async {
    final data = await _api.request(
      'GET',
      '/customer/vehicles/$vehicleId/passport',
    );
    final vehicle = Json.from(data['vehicle']);
    vehicle['health_score'] = data['health']?['score'];
    return ServicePassport(
      vehicle: portalVehicle(vehicle),
      verified: (data['vitals']?['services_completed'] ?? 0) > 0,
      garage: data['garage']?['name'] ?? garageName,
      visits: [
        for (final visit in data['history'] ?? const [])
          ServiceVisit(
            date: _date(visit['date']),
            title: visit['service_type'] ?? '',
            km: visit['km'],
            garage: garageName,
            total: visit['cost'] == null ? null : Money.fromApi(visit['cost']),
          ),
      ],
      link: _api.base
          .replace(path: '${_api.base.path}/public/passport/$vehicleId')
          .toString(),
      issued: _date(data['issued_at']),
    );
  }

  @override
  Future<List<PortalAppointment>> appointments() async {
    final page = await history('appointments');
    final result = <PortalAppointment>[];
    for (final item in page.items) {
      final match = RegExp(r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})')
          .firstMatch('${item['title']}');
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
    final data = await _api.request('GET', '/customer/billing');
    final invoices = [
      for (final item in data['invoices'] ?? const [])
        _invoice(Json.from(item)),
    ];
    return BillingOverview(
      owed: Money.fromApi(data['balance_due']),
      estimates: [
        for (final item in data['estimates'] ?? const [])
          _estimate(Json.from(item)),
      ],
      invoices: invoices,
      receipts: [
        for (final p in data['receipts'] ?? const [])
          (
            '${p['invoice_code'] ?? ''}',
            Receipt(
              '${p['id']}',
              Money.fromApi(p['amount']),
              p['method'] ?? 'cash',
              _date(p['date']),
            ),
          ),
      ],
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
            _date(payment['date']),
            kind: payment['kind'] ?? 'payment',
          ),
      ],
    );
  }

  @override
  Future<Estimate> estimate(String id) async => _estimate(
    Json.from(await _api.request('GET', '/customer/billing/documents/$id')),
  );
  @override
  Future<Estimate> decideEstimate(String id, {required bool approve}) async {
    await _api.request(
      'POST',
      '/customer/billing/estimates/$id/${approve ? 'approve' : 'decline'}',
    );
    return estimate(id);
  }

  @override
  Future<String> askAboutEstimate(String id, String question) async {
    final result = await _api.request(
      'POST',
      '/customer/billing/estimates/$id/question',
      body: {'body': question},
    );
    return result['conversation_id'];
  }

  @override
  Future<List<Thread>> threads() async {
    final data = await _api.request('GET', '/customer/messages');
    return [for (final item in data['conversations']) _thread(Json.from(item))];
  }

  @override
  Future<List<ChatMessage>> messages(String threadId) async {
    final data = await _api.request('GET', '/customer/messages/$threadId');
    return [for (final item in data['messages']) _message(Json.from(item))];
  }

  @override
  Future<ChatMessage> send(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) async {
    final body = <String, dynamic>{
      'body': text.trim(),
      'attachments': [
        for (final photo in photos) {'file_id': photo.split('/').last},
      ],
    };
    final fingerprint = jsonEncode(body);
    final scope = _api.operationScope('customer-message/$threadId');
    final key = await PendingIdempotency.getOrCreate(scope, fingerprint);
    try {
      final response = await _api.request(
        'POST',
        '/customer/messages/$threadId',
        body: body,
        idempotencyKey: key,
      );
      await PendingIdempotency.clear(scope, fingerprint);
      return _message(Json.from(response));
    } on AppFailure catch (error) {
      if (!error.uncertain) await PendingIdempotency.clear(scope, fingerprint);
      rethrow;
    }
  }

  @override
  Future<RoadsideCase> requestRoadside({
    required String vehicleId,
    required RoadsideProblem problem,
    required GeoPoint location,
  }) async {
    final body = <String, dynamic>{
      'vehicle_id': vehicleId,
      'description': problem.name,
      'location_lat': location.latitude,
      'location_lng': location.longitude,
      'location_text': location.address,
    };
    final fingerprint = jsonEncode(body);
    final scope = _api.operationScope('customer-roadside');
    final key = await PendingIdempotency.getOrCreate(scope, fingerprint);
    try {
      final response = await _api.request(
        'POST',
        '/customer/roadside',
        body: body,
        idempotencyKey: key,
      );
      await PendingIdempotency.clear(scope, fingerprint);
      return _roadside(Json.from(response));
    } on AppFailure catch (error) {
      if (!error.uncertain) await PendingIdempotency.clear(scope, fingerprint);
      rethrow;
    }
  }

  @override
  Future<RoadsideCase> roadside(String id) async =>
      _roadside(Json.from(await _api.request('GET', '/customer/roadside/$id')));
  @override
  Future<void> changePassword(String current, String next) async {
    final tokens = await _api.request(
      'POST',
      '/customer/me/password',
      body: {'current_password': current, 'new_password': next},
    );
    _api.accessToken = tokens['access_token'];
    _api.refreshToken = tokens['refresh_token'];
    await _api.onTokensChanged?.call();
  }

  @override
  Future<void> deleteAccount({String? password}) async {
    await _api.request('DELETE', '/customer/me', body: {'password': password});
    // Deletion already revoked every server session. A later local logout must
    // not attempt authentication with credentials belonging to a deleted account.
    _api.accessToken = null;
    _api.refreshToken = null;
  }

  @override
  Future<String> uploadPhoto(List<int> bytes, String name) async {
    final data = await _api.request(
      'POST',
      '/customer/files',
      fileBytes: bytes,
      fileName: name,
    );
    return data['url'];
  }

  @override
  Future<List<int>> photoBytes(String url) async {
    final path = Uri.parse(url).path.replaceFirst(_api.base.path, '');
    return List<int>.from(await _api.request('GET', path, binary: true));
  }

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
    final scope = _api.operationScope('customer-booking');
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
