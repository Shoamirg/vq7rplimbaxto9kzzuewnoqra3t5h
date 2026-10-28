import 'dart:convert';

import '../domain/models.dart';
import '../domain/portal.dart';
import 'api_client.dart';
import 'pending_idempotency.dart';
import 'payment_store.dart';
import 'photo_access.dart';
import 'portal_mapper.dart';
import 'notification_feed.dart';

import 'dart:math';

enum WorkAction { confirm, assign, start, complete, createInvoice, openInvoice }

abstract class GarageRepository {
  PaymentStore payments = MemoryPaymentStore();
  bool get isDemo;
  bool get canWrite => true;
  bool get canManageAccounts => isDemo && canWrite;
  bool get isMechanic => false;
  bool get canPerformWork => canWrite || isMechanic;
  WorkAction? primaryWorkAction(Work work, {required bool hasInvoice}) {
    if (!canPerformWork) {
      return !isMechanic && work.status == WorkStatus.completed && hasInvoice
          ? WorkAction.openInvoice
          : null;
    }
    return switch (work.status) {
      WorkStatus.pending => isMechanic ? null : WorkAction.confirm,
      WorkStatus.confirmed =>
        (work.mechanic?.trim().isNotEmpty ?? false)
            ? WorkAction.start
            : WorkAction.assign,
      WorkStatus.inProgress => WorkAction.complete,
      WorkStatus.completed =>
        isMechanic
            ? null
            : hasInvoice
            ? WorkAction.openInvoice
            : WorkAction.createInvoice,
      _ => null,
    };
  }

  Future<List<Mechanic>> mechanics() async => const [];
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
    bool awaitingInvoice = false,
  });
  Future<Work> work(String id);
  Future<Work> createWork(Json data);
  Future<Work> changeWork(String id, String action, [Json? data]);
  Future<PageData<Customer>> customers({String query = '', int page = 1});
  Future<Customer> createCustomer(String name, String phone);
  Future<List<Car>> cars(String customerId);
  Future<List<CarModel>> catalog();
  Future<Car> createCar(Json data);
  Future<PageData<Bill>> bills({
    String query = '',
    int page = 1,
    BillView view = BillView.all,
  });
  Future<Bill> bill(String id);
  Future<Bill?> billForWork(String id);

  /// [send] issues the invoice to the customer; otherwise it stays a draft
  /// where the source supports drafts.
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate, {
    bool send = true,
  });
  Future<Bill> sendBill(String id) async =>
      throw const AppFailure.unavailable();
  Future<Bill> pay(String id, Money amount, String method, String key);

  /// Reception customer card. Sources fill what they can; null sections
  /// are hidden rather than invented. [full] false skips history (job
  /// detail only needs contact and cars).
  Future<CustomerFile> customerFile(
    Customer customer, {
    bool full = true,
  }) async => CustomerFile(customer: customer, cars: await cars(customer.id));
  Future<AppLogin> openAppLogin(String customerId, String email) async =>
      throw const AppFailure.unavailable();

  // Reception inbox.
  Future<List<Thread>> threads() async => throw const AppFailure.unavailable();
  Future<List<ChatMessage>> messages(String threadId) async =>
      throw const AppFailure.unavailable();
  Future<ChatMessage> sendMessage(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) async => throw const AppFailure.unavailable();
  Future<LogoutOutcome> logout() async => LogoutOutcome.none;
  void close() {}
}

class LiveRepository extends GarageRepository
    implements PhotoAccess, NotificationFeed {
  Bill _bill(Json value) => Bill.fromJson(value, timeZone: api.serviceTimeZone);
  LiveRepository(
    this.api, {
    PaymentStore? paymentStore,
    this.canWrite = false,
    this.isMechanic = false,
    this.canManageAccounts = false,
  }) {
    if (paymentStore != null) payments = paymentStore;
  }
  final ApiClient api;
  @override
  Future<List<AppNotification>> notifications() async {
    if (isMechanic) return const [];
    final data = await api.request('GET', '/notifications');
    return [
      for (final item in data['items'])
        AppNotification(
          '${item['id']}',
          item['title'] ?? '',
          item['body'] ?? '',
        ),
    ];
  }

  @override
  final bool canWrite;
  @override
  final bool isMechanic;
  @override
  final bool canManageAccounts;
  String get workPath => isMechanic ? '/mechanic/work' : '/appointments';
  @override
  Future<List<Mechanic>> mechanics() async {
    final data = await api.request('GET', '/mechanics');
    return (data['items'] as List).map((j) => Mechanic.fromJson(j)).toList();
  }

  @override
  bool get isDemo => false;
  @override
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
    bool awaitingInvoice = false,
  }) async {
    if (isMechanic && awaitingInvoice) {
      throw const AppFailure('Bu amal uchun ruxsat yoʻq.', status: 403);
    }
    final data = await api.request(
      'GET',
      workPath,
      query: {
        'q': query,
        'page': '$page',
        'page_size': '30',
        if (date != null) 'date_from': dateKey(date),
        if (date != null) 'date_to': dateKey(date),
        if (status != null) 'status': status.code,
        if (awaitingInvoice) 'awaiting_invoice': 'true',
      },
    );
    return PageData(
      (data['items'] as List).map((j) => Work.fromJson(j)).toList(),
      data['total'],
      page,
    );
  }

  @override
  Future<Work> work(String id) async =>
      Work.fromJson(await api.request('GET', '$workPath/$id'));
  @override
  Future<Work> createWork(Json data) async {
    final entries = data.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final fingerprint = jsonEncode(Map.fromEntries(entries));
    final scope = api.operationScope('staff-work-order');
    final key = await PendingIdempotency.getOrCreate(scope, fingerprint);
    try {
      final result = await api.request(
        'POST',
        '/appointments/direct',
        body: data,
        idempotencyKey: key,
      );
      await PendingIdempotency.clear(scope, fingerprint);
      return Work.fromJson(result);
    } catch (_) {
      // A lost response keeps the same key in memory so an explicit retry of
      // the unchanged work order replays instead of creating a second one.
      rethrow;
    }
  }

  @override
  Future<Work> changeWork(String id, String action, [Json? data]) async =>
      Work.fromJson(
        await api.request('PATCH', '$workPath/$id/$action', body: data),
      );
  @override
  Future<PageData<Customer>> customers({
    String query = '',
    int page = 1,
  }) async {
    final data = await api.request(
      'GET',
      '/customers',
      query: {'q': query, 'limit': '30', 'offset': '${(page - 1) * 30}'},
    );
    return PageData(
      (data['items'] as List).map((j) => Customer.fromJson(j)).toList(),
      data['total'],
      page,
    );
  }

  @override
  Future<Customer> createCustomer(String name, String phone) async =>
      Customer.fromJson(
        await api.request(
          'POST',
          '/customers',
          body: {'full_name': name, 'phone': phone},
        ),
      );
  @override
  Future<List<Car>> cars(String customerId) async {
    final data = await api.request('GET', '/customers/$customerId');
    return (data['vehicles'] as List)
        .map((j) => Car.fromJson(j, customerId))
        .toList();
  }

  @override
  Future<List<CarModel>> catalog() async {
    final data = await api.request('GET', '/vehicles/catalog');
    return [
      for (final brand in data['brands'])
        for (final model in brand['models'])
          CarModel(model['id'], '${brand['name']} ${model['name']}'),
    ];
  }

  @override
  Future<Car> createCar(Json data) async => Car.fromJson(
    await api.request('POST', '/vehicles', body: data),
    data['customer_id'],
  );
  @override
  Future<CustomerFile> customerFile(
    Customer customer, {
    bool full = true,
  }) async {
    final detail = await api.request('GET', '/customers/${customer.id}');
    final cars = (detail['vehicles'] as List? ?? [])
        .map((j) => Car.fromJson(j, customer.id))
        .toList();
    final contact = Customer(
      customer.id,
      detail['full_name'] ?? customer.name,
      detail['phone'] ?? customer.phone,
      vehicleCount: cars.length,
    );
    if (!full) {
      return CustomerFile(
        customer: contact,
        cars: cars,
        email: detail['email'],
      );
    }
    final invoices = await api.request(
      'GET',
      '/invoices',
      query: {
        'view': 'invoices',
        'customer_id': customer.id,
        'page': '1',
        'page_size': '30',
      },
    );
    final bills = (invoices['items'] as List).map((j) => _bill(j)).toList();
    final account = canManageAccounts
        ? await api.request('GET', '/customers/${customer.id}/account')
        : null;
    return CustomerFile(
      customer: contact,
      cars: cars,
      email: detail['email'],
      bills: bills,
      jobs: [
        for (final row in detail['appointments'] ?? const [])
          Work(
            id: row['id'],
            customerId: contact.id,
            customerName: contact.name,
            vehicleId: row['vehicle_id'],
            vehicleLabel:
                cars
                    .where((car) => car.id == row['vehicle_id'])
                    .map((car) => car.label)
                    .firstOrNull ??
                '',
            date: civilDate(row['local_date'] ?? row['date']),
            time: row['time'] ?? '',
            duration: row['duration'] ?? 60,
            status: WorkStatus.parse(row['status']),
            mechanic: row['mechanic_name'],
          ),
      ],
      lifetimeValue: Money.fromApi(
        detail['financial']?['lifetime_spend'] ??
            detail['stats']?['lifetime_value'] ??
            0,
      ),
      appLogin: canManageAccounts
          ? (account != null && account['is_active'] == true)
          : null,
    );
  }

  @override
  Future<PageData<Bill>> bills({
    String query = '',
    int page = 1,
    BillView view = BillView.all,
  }) async {
    final data = await api.request(
      'GET',
      '/invoices',
      query: {
        'view': switch (view) {
          BillView.drafts => 'drafts',
          BillView.unpaid => 'awaiting',
          BillView.paid => 'paid',
          BillView.all => 'invoices',
        },
        'q': query,
        'page': '$page',
        'page_size': '30',
      },
    );
    var items = (data['items'] as List).map((j) => _bill(j)).toList();
    return PageData(
      items,
      data['total'],
      data['page'],
      size: data['page_size'],
    );
  }

  /// Sharing an issued invoice leaves its balance and status unchanged.
  @override
  Future<Bill> sendBill(String id) async =>
      _bill(await api.request('POST', '/invoices/$id/send'));

  @override
  Future<Bill> bill(String id) async =>
      _bill(await api.request('GET', '/invoices/$id'));
  @override
  Future<Bill?> billForWork(String id) async {
    // Assigned mechanics never enter the staff billing workflow.
    if (isMechanic) return null;
    try {
      return _bill(await api.request('GET', '/appointments/$id/invoice'));
    } on AppFailure catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  /// Saving keeps a real draft; sending issues it and notifies the customer.
  @override
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate, {
    bool send = true,
  }) async {
    final created = _bill(
      await api.request(
        'POST',
        '/invoices',
        body: {
          'kind': 'invoice',
          'customer_id': work.customerId,
          'vehicle_id': work.vehicleId,
          'appointment_id': work.id,
          'tax_rate': taxRate,
          'line_items': lines.map((l) => l.toJson()).toList(),
          if (!send) 'draft': true,
        },
      ),
    );
    if (!send) return created;
    try {
      return await sendBill(created.id);
    } catch (_) {
      // The invoice exists; reporting a failure here would invite a
      // duplicate. Sharing can be retried from the invoice screen.
      return created;
    }
  }

  @override
  Future<Bill> pay(String id, Money amount, String method, String key) async {
    await payments.write(id, PendingPayment(amount, method, key));
    try {
      final result = _bill(
        await api.request(
          'POST',
          '/invoices/$id/payments',
          idempotencyKey: key,
          body: {
            'amount': amount.apiValue,
            'method': method,
            'kind': 'payment',
            'source': 'manual',
          },
        ),
      );
      await payments.clear(id);
      return result;
    } on AppFailure catch (e) {
      if (!e.uncertain) await payments.clear(id);
      rethrow;
    }
  }

  @override
  Future<LogoutOutcome> logout() => api.logout();

  @override
  Future<AppLogin> openAppLogin(String customerId, String email) async {
    final random = Random.secure();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!';
    final password = List.generate(
      18,
      (_) => alphabet[random.nextInt(alphabet.length)],
    ).join();
    await api.request(
      'POST',
      '/customers/$customerId/account',
      body: {'email': email.trim(), 'password': password},
    );
    return AppLogin(email.trim(), password);
  }

  @override
  Future<List<Thread>> threads() async {
    final data = await api.request(
      'GET',
      '/conversations',
      query: {'view': 'all'},
    );
    return [
      for (final item in data['items'] ?? const [])
        portalThread(
          Json.from(item),
          staff: true,
          timeZone: api.serviceTimeZone,
        ),
    ];
  }

  @override
  Future<List<ChatMessage>> messages(String threadId) async {
    final data = await api.request('GET', '/conversations/$threadId');
    return [
      for (final item in data['messages'] ?? const [])
        portalMessage(
          Json.from(item),
          staff: true,
          timeZone: api.serviceTimeZone,
        ),
    ];
  }

  @override
  Future<ChatMessage> sendMessage(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) async {
    final body = <String, dynamic>{
      'body': text.trim(),
      'channel': 'app',
      'attachments': [
        for (final photo in photos)
          {
            'kind': 'photo',
            'label': 'Photo',
            'url': photo,
            'meta': {'file_id': photo.split('/').last},
          },
      ],
    };
    final scope = api.operationScope('staff-message/$threadId');
    final fingerprint = jsonEncode(body);
    final key = await PendingIdempotency.getOrCreate(scope, fingerprint);
    try {
      final response = await api.request(
        'POST',
        '/conversations/$threadId/messages',
        body: body,
        idempotencyKey: key,
      );
      await PendingIdempotency.clear(scope, fingerprint);
      return portalMessage(
        Json.from(response),
        staff: true,
        timeZone: api.serviceTimeZone,
      );
    } on AppFailure catch (error) {
      if (!error.uncertain) await PendingIdempotency.clear(scope, fingerprint);
      rethrow;
    }
  }

  @override
  Future<String> uploadPhoto(List<int> bytes, String name) async {
    final data = await api.request(
      'POST',
      '/files',
      fileBytes: bytes,
      fileName: name,
    );
    return data['url'];
  }

  @override
  Future<List<int>> photoBytes(String url) async {
    final path = Uri.parse(url).path.replaceFirst(api.base.path, '');
    return List<int>.from(await api.request('GET', path, binary: true));
  }

  @override
  void close() => api.close();
}
