import 'package:uuid/uuid.dart';

import '../domain/models.dart';
import 'api_client.dart';
import 'repository.dart';

/// Only in-memory example data. Never calls the live API.
class DemoRepository extends GarageRepository {
  DemoRepository({DateTime? today}) {
    final day = civilDate(dateKey(today ?? DateTime.now()));
    _customers.addAll(const [
      Customer('c1', 'Aziz Karimov', '+998901234567'),
      Customer('c2', 'Dilnoza Saidova', '+998935554433'),
      Customer('c3', 'Bekzod Aliyev', '+998977771122'),
    ]);
    _cars.addAll(const [
      Car('v1', 'c1', 'Chevrolet Cobalt', '01A123BC', 2021, 84216),
      Car('v2', 'c2', 'Chevrolet Gentra', '01R482MA', 2023, 32600),
      Car('v3', 'c3', 'Chevrolet Spark', '10B771KA', 2020, 67800),
    ]);
    for (var i = 0; i < 3; i++) {
      _works.add(
        Work(
          id: 'w${i + 1}',
          customerId: _customers[i].id,
          customerName: _customers[i].name,
          vehicleId: _cars[i].id,
          vehicleLabel: '${_cars[i].label} (${_cars[i].plate})',
          date: day,
          time: ['09:00', '11:00', '14:00'][i],
          duration: 60,
          status: [
            WorkStatus.pending,
            WorkStatus.inProgress,
            WorkStatus.completed,
          ][i],
          mechanic: i == 0 ? null : ['Sherzod Rahimov', 'Bobur Aliyev'][i - 1],
          customerNotes: [
            'Tormozlaganda gʻichirlaydi.',
            'Moy va filtrni almashtirish.',
            'Kompyuter diagnostikasi.',
          ][i],
        ),
      );
    }
  }
  static const _uuid = Uuid();
  final _customers = <Customer>[];
  final _cars = <Car>[];
  final _works = <Work>[];
  final _bills = <Bill>[];
  final _payments =
      <
        String,
        ({String invoice, int cents, String method, String receiptId})
      >{};
  @override
  bool get isDemo => true;
  PageData<T> _page<T>(List<T> items, int page) => PageData(
    items.skip((page - 1) * 30).take(30).toList(),
    items.length,
    page,
  );
  @override
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
  }) async => _page(
    _works
        .where(
          (w) =>
              (date == null || dateKey(w.date) == dateKey(date)) &&
              (status == null || w.status == status) &&
              '${w.customerName} ${w.vehicleLabel} ${w.mechanic}'
                  .toLowerCase()
                  .contains(query.toLowerCase()),
        )
        .toList()
      ..sort((a, b) => '${a.date}${a.time}'.compareTo('${b.date}${b.time}')),
    page,
  );
  @override
  Future<Work> work(String id) async => _works.firstWhere((w) => w.id == id);
  @override
  Future<Work> createWork(Json data) async {
    final customer = _customers.firstWhere((c) => c.id == data['customer_id']);
    final car = _cars.firstWhere(
      (c) => c.id == data['vehicle_id'] && c.customerId == customer.id,
    );
    final date = civilDate(data['appointment_date']);
    final time = data['appointment_time'] as String;
    final start =
        int.parse(time.substring(0, 2)) * 60 + int.parse(time.substring(3));
    final duration = data['estimated_duration_minutes'] as int;
    final mechanic = (data['mechanic_name'] as String?)?.trim();
    if (_works.any((w) {
      final other =
          int.parse(w.time.substring(0, 2)) * 60 +
          int.parse(w.time.substring(3));
      return dateKey(w.date) == dateKey(date) &&
          ![WorkStatus.cancelled, WorkStatus.completed].contains(w.status) &&
          (w.vehicleId == car.id ||
              (mechanic != null &&
                  mechanic.isNotEmpty &&
                  w.mechanic == mechanic)) &&
          start < other + w.duration &&
          other < start + duration;
    })) {
      throw const AppFailure(
        'Bu vaqtda usta yoki mashina band. Boshqa vaqtni tanlang.',
      );
    }
    final value = Work(
      id: _uuid.v4(),
      customerId: customer.id,
      customerName: customer.name,
      vehicleId: car.id,
      vehicleLabel: '${car.label} (${car.plate ?? 'raqam yoʻq'})',
      date: date,
      time: time,
      duration: duration,
      status: WorkStatus.pending,
      mechanic: mechanic,
      customerNotes: data['customer_notes'],
    );
    _works.add(value);
    return value;
  }

  @override
  Future<Work> changeWork(String id, String action, [Json? data]) async {
    final index = _works.indexWhere((w) => w.id == id);
    final old = _works[index];
    final allowed = switch (action) {
      'confirm' => old.status == WorkStatus.pending,
      'start' =>
        old.status == WorkStatus.confirmed &&
            (old.mechanic?.trim().isNotEmpty ?? false),
      'complete' => old.status == WorkStatus.inProgress,
      'assign-mechanic' => old.canAssignMechanic,
      'cancel' => old.canCancel,
      _ => false,
    };
    if (!allowed) {
      throw const AppFailure(
        'Avval ish holati va usta tayinlanganini tekshiring.',
      );
    }
    final value = old.changed(
      status: switch (action) {
        'confirm' => WorkStatus.confirmed,
        'start' => WorkStatus.inProgress,
        'complete' => WorkStatus.completed,
        'cancel' => WorkStatus.cancelled,
        _ => old.status,
      },
      mechanic: data?['mechanic_name'],
      notes: data?['notes'],
    );
    _works[index] = value;
    return value;
  }

  @override
  Future<PageData<Customer>> customers({
    String query = '',
    int page = 1,
  }) async => _page(
    _customers
        .where(
          (c) => '${c.name} ${c.phone}'.toLowerCase().contains(
            query.toLowerCase(),
          ),
        )
        .map(
          (c) => Customer(
            c.id,
            c.name,
            c.phone,
            vehicleCount: _cars.where((v) => v.customerId == c.id).length,
          ),
        )
        .toList(),
    page,
  );
  @override
  Future<Customer> createCustomer(String name, String phone) async {
    final normalized = phone.replaceAll(RegExp(r'\D'), '');
    if (_customers.any(
      (c) => c.phone.replaceAll(RegExp(r'\D'), '') == normalized,
    )) {
      throw const AppFailure(
        'Bu telefon bilan mijoz mavjud. Qidiruvdan toping.',
      );
    }
    final customer = Customer(_uuid.v4(), name, '+$normalized');
    _customers.add(customer);
    return customer;
  }

  @override
  Future<List<Car>> cars(String customerId) async =>
      _cars.where((c) => c.customerId == customerId).toList();
  @override
  Future<List<CarModel>> catalog() async => const [
    CarModel('m1', 'Chevrolet Cobalt'),
    CarModel('m2', 'Chevrolet Gentra'),
    CarModel('m3', 'Chevrolet Spark'),
    CarModel('m4', 'Chevrolet Damas'),
    CarModel('m5', 'Chevrolet Tracker'),
  ];
  @override
  Future<Car> createCar(Json data) async {
    final plate = (data['license_plate'] as String)
        .replaceAll(RegExp(r'[\s-]'), '')
        .toUpperCase();
    if (_cars.any((c) => c.plate == plate)) {
      throw const AppFailure('Bu davlat raqami allaqachon mavjud.');
    }
    final model = (await catalog()).firstWhere(
      (m) => m.id == data['vehicle_model_id'],
    );
    final car = Car(
      _uuid.v4(),
      data['customer_id'],
      model.label,
      plate,
      data['year'],
      data['current_km'],
    );
    _cars.add(car);
    return car;
  }

  @override
  Future<PageData<Bill>> bills({String query = '', int page = 1}) async {
    final q = query.trim().toLowerCase();
    final matches = _bills.reversed
        .where(
          (bill) => [
            bill.code,
            bill.customerName,
            bill.vehicleLabel,
          ].any((text) => text.toLowerCase().contains(q)),
        )
        .toList();
    return PageData(
      List.unmodifiable(matches.skip((page - 1) * 30).take(30)),
      matches.length,
      page,
    );
  }

  @override
  Future<Bill> bill(String id) async => _bills.firstWhere((b) => b.id == id);
  @override
  Future<Bill?> billForWork(String id) async {
    final matches = _bills.where((b) => b.appointmentId == id);
    return matches.isEmpty ? null : matches.first;
  }

  @override
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate,
  ) async {
    final current = await this.work(work.id);
    if (current.status != WorkStatus.completed || lines.isEmpty) {
      throw const AppFailure('Avval servis ishini tugating.');
    }
    final existing = await billForWork(work.id);
    if (existing != null) return existing;
    final subtotal = lines.fold<int>(0, (sum, line) => sum + line.total.cents);
    final tax = (subtotal * taxRate / 100).round();
    final value = Bill(
      id: _uuid.v4(),
      code:
          'INV-${DateTime.now().year}-${(_bills.length + 1).toString().padLeft(6, '0')}',
      customerId: work.customerId,
      customerName: work.customerName,
      currency: 'UZS',
      status: 'issued',
      total: Money(subtotal + tax),
      paid: const Money(0),
      balance: Money(subtotal + tax),
      subtotal: Money(subtotal),
      tax: Money(tax),
      discount: const Money(0),
      appointmentId: work.id,
      vehicleLabel: work.vehicleLabel,
      lines: List.unmodifiable(lines),
      dueDate: DateTime.now().add(const Duration(days: 7)),
    );
    _bills.add(value);
    return value;
  }

  @override
  Future<Bill> pay(String id, Money amount, String method, String key) async {
    final index = _bills.indexWhere((b) => b.id == id);
    final old = _bills[index];
    final prior = _payments[key];
    if (prior != null) {
      if (prior.invoice != id ||
          prior.cents != amount.cents ||
          prior.method != method) {
        throw const AppFailure(
          'Toʻlov tafsilotlari oʻzgargan. Hisobni tekshiring.',
        );
      }
      return old;
    }
    if (!old.canPay || amount.cents <= 0 || amount.cents > old.balance.cents) {
      throw const AppFailure(
        'Toʻlov musbat boʻlsin va qolgan summadan oshmasin.',
      );
    }
    final receipt = Receipt(_uuid.v4(), amount, method, DateTime.now());
    final value = old.withPayment(receipt);
    _payments[key] = (
      invoice: id,
      cents: amount.cents,
      method: method,
      receiptId: receipt.id,
    );
    _bills[index] = value;
    return value;
  }
}
