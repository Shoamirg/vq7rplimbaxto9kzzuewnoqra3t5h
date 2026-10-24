import 'dart:convert';

import '../domain/models.dart';
import '../domain/portal.dart';
import 'api_client.dart';
import 'pending_idempotency.dart';
import 'payment_store.dart';

enum WorkAction { confirm, assign, start, complete, createInvoice, openInvoice }

abstract class GarageRepository {
  PaymentStore payments = MemoryPaymentStore();
  bool get isDemo;
  bool get canWrite => true;
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

class LiveRepository extends GarageRepository {
  LiveRepository(
    this.api, {
    PaymentStore? paymentStore,
    this.canWrite = false,
    this.isMechanic = false,
  }) {
    if (paymentStore != null) payments = paymentStore;
  }
  final ApiClient api;
  @override
  final bool canWrite;
  @override
  final bool isMechanic;
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
    const scope = 'staff-work-order';
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
      return CustomerFile(customer: contact, cars: cars, email: detail['email']);
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
    final bills = (invoices['items'] as List)
        .map((j) => Bill.fromJson(j))
        .toList();
    return CustomerFile(
      customer: contact,
      cars: cars,
      email: detail['email'],
      bills: bills,
      lifetimeValue: Money(bills.fold(0, (sum, b) => sum + b.paid.cents)),
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
          BillView.paid => 'payments',
          BillView.all => 'invoices',
        },
        'q': query,
        'page': '$page',
        'page_size': '30',
      },
    );
    var items = (data['items'] as List).map((j) => Bill.fromJson(j)).toList();
    // The API's payments view includes part-paid invoices.
    if (view == BillView.paid) items = items.where((b) => b.status == 'paid').toList();
    return PageData(items, data['total'], data['page'], size: data['page_size']);
  }

  /// Sharing an issued invoice leaves its balance and status unchanged.
  @override
  Future<Bill> sendBill(String id) async =>
      Bill.fromJson(await api.request('POST', '/invoices/$id/send'));

  @override
  Future<Bill> bill(String id) async =>
      Bill.fromJson(await api.request('GET', '/invoices/$id'));
  @override
  Future<Bill?> billForWork(String id) async {
    // Assigned mechanics never enter the staff billing workflow.
    if (isMechanic) return null;
    try {
      return Bill.fromJson(
        await api.request('GET', '/appointments/$id/invoice'),
      );
    } on AppFailure catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  /// The API issues invoices on creation; [send] also notifies the customer.
  @override
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate, {
    bool send = true,
  }) async {
    final created = Bill.fromJson(
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
      final result = Bill.fromJson(
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
  void close() => api.close();
}
