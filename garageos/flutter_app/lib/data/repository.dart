import '../domain/models.dart';
import 'api_client.dart';
import 'payment_store.dart';

abstract class GarageRepository {
  PaymentStore payments = MemoryPaymentStore();
  bool get isDemo;
  bool get canWrite => true;
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
  });
  Future<Work> work(String id);
  Future<Work> createWork(Json data);
  Future<Work> changeWork(String id, String action, [Json? data]);
  Future<PageData<Customer>> customers({String query = '', int page = 1});
  Future<Customer> createCustomer(String name, String phone);
  Future<List<Car>> cars(String customerId);
  Future<List<CarModel>> catalog();
  Future<Car> createCar(Json data);
  Future<List<Bill>> bills();
  Future<Bill> bill(String id);
  Future<Bill?> billForWork(String id);
  Future<Bill> createBill(Work work, List<BillLine> lines, double taxRate);
  Future<Bill> pay(String id, Money amount, String method, String key);
  void close() {}
}

class LiveRepository extends GarageRepository {
  LiveRepository(
    this.api, {
    PaymentStore? paymentStore,
    this.canWrite = false,
  }) {
    if (paymentStore != null) payments = paymentStore;
  }
  final ApiClient api;
  @override
  final bool canWrite;
  @override
  bool get isDemo => false;
  @override
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
  }) async {
    final data = await api.request(
      'GET',
      '/appointments',
      query: {
        'q': query,
        'page': '$page',
        'page_size': '30',
        if (date != null) 'date_from': dateKey(date),
        if (date != null) 'date_to': dateKey(date),
        if (status != null) 'status': status.code,
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
      Work.fromJson(await api.request('GET', '/appointments/$id'));
  @override
  Future<Work> createWork(Json data) async => Work.fromJson(
    await api.request('POST', '/appointments/direct', body: data),
  );
  @override
  Future<Work> changeWork(String id, String action, [Json? data]) async =>
      Work.fromJson(
        await api.request('PATCH', '/appointments/$id/$action', body: data),
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
  Future<List<Bill>> bills() async {
    final data = await api.request(
      'GET',
      '/invoices',
      query: {'view': 'invoices'},
    );
    return (data['items'] as List).map((j) => Bill.fromJson(j)).toList();
  }

  @override
  Future<Bill> bill(String id) async =>
      Bill.fromJson(await api.request('GET', '/invoices/$id'));
  @override
  Future<Bill?> billForWork(String id) async {
    try {
      return Bill.fromJson(
        await api.request('GET', '/appointments/$id/invoice'),
      );
    } on AppFailure catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  @override
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate,
  ) async => Bill.fromJson(
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
  void close() => api.close();
}
