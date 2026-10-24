import 'package:uuid/uuid.dart';

import '../domain/models.dart';
import '../domain/portal.dart';
import 'api_client.dart';
import 'repository.dart';

/// Only in-memory example data. Never calls the live API.
class DemoRepository extends GarageRepository {
  DemoRepository({DateTime? today, this.mechanicMode = false}) {
    final day = civilDate(dateKey(today ?? DateTime.now()));
    _today = day;
    _customers.addAll(const [
      Customer('c1', 'Aziz Karimov', '+998901234567'),
      Customer('c2', 'Dilnoza Saidova', '+998935554433'),
      Customer('c3', 'Bekzod Aliyev', '+998977771122'),
    ]);
    _cars.addAll(const [
      Car(
        'v1',
        'c1',
        'Chevrolet Cobalt',
        '01A777AA',
        2021,
        84200,
        vin: 'XWBJA69V1MA012345',
      ),
      Car('v2', 'c2', 'Chevrolet Gentra', '01R482MA', 2019, 132600),
      Car('v3', 'c3', 'Chevrolet Malibu', '10B771KA', 2022, 41800),
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
          time: ['14:30', '11:00', '09:00'][i],
          duration: 60,
          status: [
            WorkStatus.pending,
            WorkStatus.inProgress,
            WorkStatus.completed,
          ][i],
          mechanic: i == 0 ? null : ['Sherzod Rahimov', 'Bobur Aliyev'][i - 1],
          mechanicUserId: i == 0
              ? null
              : ['demo-mechanic-1', 'demo-mechanic-2'][i - 1],
          serviceType: [
            'Moy almashtirish',
            'Tormoz kolodkalari',
            'Kompyuter diagnostikasi',
          ][i],
          customerNotes: [
            'Tormozlaganda gʻichirlaydi.',
            'Moy va filtrni almashtirish.',
            'Dvigatel chirogʻi yonib turibdi.',
          ][i],
        ),
      );
    }
    if (mechanicMode) {
      _customers.add(const Customer('c4', 'Jasur Tursunov', '+998901112233'));
      _cars.add(
        const Car('v4', 'c4', 'BYD Song Plus', '01Z404EV', 2024, 12400),
      );
      _works.add(
        Work(
          id: 'w4',
          customerId: 'c4',
          customerName: 'Jasur Tursunov',
          vehicleId: 'v4',
          vehicleLabel: 'BYD Song Plus (01Z404EV)',
          date: day,
          time: '16:00',
          duration: 90,
          status: WorkStatus.confirmed,
          mechanic: 'Sherzod Rahimov',
          mechanicUserId: 'demo-mechanic-1',
          serviceType: 'Tormoz kolodkalari',
          customerNotes: 'Old kolodkalarni almashtirish. Disklarni ham koʻring.',
        ),
      );
    }
    _bills.addAll([
      _seedBill(
        'b1',
        'INV-2026-000131',
        _customers[1],
        _cars[1],
        [const BillLine('Tormoz kolodkalari (old)', 1, Money(42000000), kind: 'part')],
        paid: 42000000,
        method: 'card',
        issued: day.subtract(const Duration(days: 12)),
      ),
      _seedBill(
        'b2',
        'INV-2026-000142',
        _customers[0],
        _cars[0],
        const [
          BillLine('Moy almashtirish', 1, Money(15000000)),
          BillLine('Motor moyi 5W-30, 1 L', 4, Money(18500000), kind: 'part'),
          BillLine('Moy filtri', 1, Money(9500000), kind: 'part'),
          BillLine('Havo filtri', 1, Money(12000000), kind: 'part'),
          BillLine('Kompyuter diagnostikasi', 1, Money(14500000)),
        ],
        paid: 50000000,
        method: 'cash',
        issued: day.subtract(const Duration(days: 2)),
      ),
      _seedBill(
        'b3',
        'INV-2026-000143',
        _customers[2],
        _cars[2],
        [const BillLine('Kompyuter diagnostikasi', 1, Money(18000000))],
        status: 'draft',
        issued: day,
      ),
    ]);
    _threads.addAll([
      Thread(
        id: 't1',
        title: 'Aziz Karimov',
        preview: 'Rahmat, 14:30 da boraman.',
        time: day.add(const Duration(hours: 9, minutes: 12)),
        unread: 2,
        context: 'Cobalt · 01 A 777 AA',
        phone: '+998901234567',
      ),
      Thread(
        id: 't2',
        title: 'Bekzod Aliyev',
        preview: 'Hisobni qachon yuborasiz?',
        time: day.add(const Duration(hours: 8, minutes: 40)),
        unread: 1,
        context: 'Malibu · 10 B 771 KA',
        phone: '+998977771122',
      ),
      Thread(
        id: 't3',
        title: 'Dilnoza Saidova',
        preview: 'Mashina tayyor boʻlsa xabar bering.',
        time: day.subtract(const Duration(hours: 5)),
        context: 'Gentra · 01 R 482 MA',
        phone: '+998935554433',
      ),
    ]);
    _messages['t1'] = [
      ChatMessage(
        id: 'm1',
        mine: false,
        author: 'Aziz Karimov',
        text: 'Assalomu alaykum! Tormozlaganda gʻichirlayapti.',
        time: day.add(const Duration(hours: 8, minutes: 55)),
      ),
      ChatMessage(
        id: 'm2',
        mine: true,
        author: 'Turon avtoservis',
        text: 'Vaalaykum assalom! Bugun 14:30 ga yozib qoʻydik.',
        time: day.add(const Duration(hours: 9, minutes: 2)),
      ),
      ChatMessage(
        id: 'm3',
        mine: false,
        author: 'Aziz Karimov',
        text: 'Rahmat, 14:30 da boraman.',
        time: day.add(const Duration(hours: 9, minutes: 12)),
      ),
    ];
    _messages['t2'] = [
      ChatMessage(
        id: 'm4',
        mine: false,
        author: 'Bekzod Aliyev',
        text: 'Hisobni qachon yuborasiz?',
        time: day.add(const Duration(hours: 8, minutes: 40)),
      ),
    ];
    _messages['t3'] = [
      ChatMessage(
        id: 'm5',
        mine: true,
        author: 'Turon avtoservis',
        text: 'Kolodkalar 2 mm qolgan ekan, almashtiramiz.',
        time: day.subtract(const Duration(hours: 6)),
        photos: const ['Old kolodka · 2 mm'],
      ),
      ChatMessage(
        id: 'm6',
        mine: false,
        author: 'Dilnoza Saidova',
        text: 'Mashina tayyor boʻlsa xabar bering.',
        time: day.subtract(const Duration(hours: 5)),
      ),
    ];
  }

  Bill _seedBill(
    String id,
    String code,
    Customer customer,
    Car car,
    List<BillLine> lines, {
    required DateTime issued,
    int paid = 0,
    String method = 'cash',
    String? status,
  }) {
    final total = lines.fold<int>(0, (sum, line) => sum + line.total.cents);
    return Bill(
      id: id,
      code: code,
      customerId: customer.id,
      customerName: customer.name,
      currency: 'UZS',
      status:
          status ??
          (paid == 0
              ? 'issued'
              : paid == total
              ? 'paid'
              : 'partial'),
      total: Money(total),
      paid: Money(paid),
      balance: Money(total - paid),
      subtotal: Money(total),
      tax: const Money(0),
      discount: const Money(0),
      vehicleLabel: '${car.label} (${car.plate})',
      lines: lines,
      receipts: [
        if (paid > 0)
          Receipt(
            'r-$id',
            Money(paid),
            method,
            issued.add(const Duration(hours: 17)),
          ),
      ],
      dueDate: issued.add(const Duration(days: 7)),
    );
  }

  final bool mechanicMode;
  late final DateTime _today;
  static const _uuid = Uuid();
  final _customers = <Customer>[];
  final _cars = <Car>[];
  final _works = <Work>[];
  final _bills = <Bill>[];
  final _threads = <Thread>[];
  final _messages = <String, List<ChatMessage>>{};
  final _logins = <String, String>{'c1': 'aziz.karimov@example.com'};
  final _payments =
      <
        String,
        ({String invoice, int cents, String method, String receiptId})
      >{};
  @override
  bool get isDemo => true;
  @override
  bool get canWrite => !mechanicMode;
  @override
  bool get isMechanic => mechanicMode;
  @override
  Future<List<Mechanic>> mechanics() async => const [
    Mechanic('demo-mechanic-1', 'Sherzod Rahimov', 'sherzod@example.com'),
    Mechanic('demo-mechanic-2', 'Bobur Aliyev', 'bobur@example.com'),
  ];
  Future<({String? name, String? id})> _assignment(Json data) async {
    final id = data['mechanic_user_id'] as String?;
    if (id == null) {
      return (name: (data['mechanic_name'] as String?)?.trim(), id: null);
    }
    final matching = (await mechanics()).where((m) => m.id == id);
    if (matching.isEmpty || data['mechanic_name'] != null) {
      throw const AppFailure('Usta akkaunti topilmadi.');
    }
    return (name: matching.first.name, id: id);
  }

  void _checkSchedule({
    required DateTime date,
    required String time,
    required int duration,
    String? mechanic,
    String? mechanicId,
    String? vehicleId,
    String? excludeId,
  }) {
    final start =
        int.parse(time.substring(0, 2)) * 60 + int.parse(time.substring(3));
    final name = mechanic?.trim().toLowerCase();
    if (_works.any((w) {
      final other =
          int.parse(w.time.substring(0, 2)) * 60 +
          int.parse(w.time.substring(3));
      final sameName =
          name != null &&
          name.isNotEmpty &&
          w.mechanic?.trim().toLowerCase() == name;
      final sameMechanic = mechanicId == null
          ? sameName
          : w.mechanicUserId == mechanicId ||
                (w.mechanicUserId == null && sameName);
      return w.id != excludeId &&
          dateKey(w.date) == dateKey(date) &&
          ![WorkStatus.cancelled, WorkStatus.completed].contains(w.status) &&
          ((vehicleId != null && w.vehicleId == vehicleId) || sameMechanic) &&
          start < other + w.duration &&
          other < start + duration;
    })) {
      throw const AppFailure(
        'Bu vaqtda usta yoki mashina band. Boshqa vaqtni tanlang.',
      );
    }
  }

  PageData<T> _page<T>(List<T> items, int page) => PageData(
    items.skip((page - 1) * 30).take(30).toList(),
    items.length,
    page,
  );
  bool _mine(Work w) =>
      !mechanicMode ||
      w.mechanicUserId == 'demo-mechanic-1' ||
      w.mechanic == 'Sherzod Rahimov';
  @override
  Future<PageData<Work>> works({
    String query = '',
    int page = 1,
    DateTime? date,
    WorkStatus? status,
    bool awaitingInvoice = false,
  }) async {
    if (mechanicMode && awaitingInvoice) {
      throw const AppFailure('Bu amal uchun ruxsat yoʻq.', status: 403);
    }
    return _page(
      _works
          .where(
            (w) =>
                _mine(w) &&
                (date == null || dateKey(w.date) == dateKey(date)) &&
                (status == null || w.status == status) &&
                (!awaitingInvoice || _withBilling(w).awaitingInvoice == true) &&
                '${w.customerName} ${w.vehicleLabel} ${w.mechanic}'
                    .toLowerCase()
                    .contains(query.toLowerCase()),
          )
          .map(_withBilling)
          .toList()
        ..sort((a, b) => '${a.date}${a.time}'.compareTo('${b.date}${b.time}')),
      page,
    );
  }

  @override
  Future<Work> work(String id) async =>
      _withBilling(_works.firstWhere((w) => w.id == id));
  Work _withBilling(Work work) {
    final matches = _bills.where((bill) => bill.appointmentId == work.id);
    final bill = matches.isEmpty ? null : matches.first;
    return work.changed(
      finalInvoiceId: bill?.id,
      awaitingInvoice: work.status == WorkStatus.completed && bill == null,
    );
  }

  @override
  Future<Work> createWork(Json data) async {
    final customer = _customers.firstWhere((c) => c.id == data['customer_id']);
    final car = _cars.firstWhere(
      (c) => c.id == data['vehicle_id'] && c.customerId == customer.id,
    );
    final date = civilDate(data['appointment_date']);
    final time = data['appointment_time'] as String;
    final duration = data['estimated_duration_minutes'] as int;
    final assignment = await _assignment(data);
    _checkSchedule(
      date: date,
      time: time,
      duration: duration,
      mechanic: assignment.name,
      mechanicId: assignment.id,
      vehicleId: car.id,
    );
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
      mechanic: assignment.name,
      mechanicUserId: assignment.id,
      customerNotes: data['customer_notes'],
    );
    _works.add(value);
    return _withBilling(value);
  }

  @override
  Future<Work> changeWork(String id, String action, [Json? data]) async {
    final index = _works.indexWhere((w) => w.id == id);
    final old = _works[index];
    final allowed = switch (action) {
      'confirm' => old.status == WorkStatus.pending && !mechanicMode,
      'start' =>
        old.status == WorkStatus.confirmed &&
            (old.mechanic?.trim().isNotEmpty ?? false),
      'complete' => old.status == WorkStatus.inProgress,
      'assign-mechanic' => old.canAssignMechanic && !mechanicMode,
      'cancel' => old.canCancel && !mechanicMode,
      _ => false,
    };
    if (!allowed) {
      throw const AppFailure(
        'Avval ish holati va usta tayinlanganini tekshiring.',
      );
    }
    final assignment = action == 'assign-mechanic'
        ? await _assignment(data ?? {})
        : null;
    if (assignment != null) {
      _checkSchedule(
        date: old.date,
        time: old.time,
        duration: old.duration,
        mechanic: assignment.name,
        mechanicId: assignment.id,
        excludeId: old.id,
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
      mechanic: assignment?.name,
      mechanicUserId: assignment?.id,
      notes: data?['notes'],
    );
    _works[index] = value;
    return _withBilling(value);
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
  Future<CustomerFile> customerFile(
    Customer customer, {
    bool full = true,
  }) async {
    final bills = _bills.where((b) => b.customerId == customer.id).toList();
    final current = _customers.firstWhere(
      (c) => c.id == customer.id,
      orElse: () => customer,
    );
    return CustomerFile(
      customer: current,
      cars: await cars(customer.id),
      email: _logins[customer.id],
      appLogin: _logins.containsKey(customer.id),
      lifetimeValue: Money(bills.fold(0, (sum, b) => sum + b.paid.cents)),
      jobs: _works.where((w) => w.customerId == customer.id).map(_withBilling).toList()
        ..sort((a, b) => '${b.date}${b.time}'.compareTo('${a.date}${a.time}')),
      bills: bills.reversed.toList(),
    );
  }

  @override
  Future<AppLogin> openAppLogin(String customerId, String email) async {
    _logins[customerId] = email.trim();
    return AppLogin(
      email.trim(),
      'Turon-${_uuid.v4().substring(0, 4)}-${_uuid.v4().substring(0, 4)}',
    );
  }

  @override
  Future<List<CarModel>> catalog() async => const [
    CarModel('m1', 'Chevrolet Cobalt'),
    CarModel('m2', 'Chevrolet Gentra'),
    CarModel('m3', 'Chevrolet Spark'),
    CarModel('m4', 'Chevrolet Damas'),
    CarModel('m5', 'Chevrolet Tracker'),
    CarModel('m6', 'Chevrolet Malibu'),
    CarModel('m7', 'BYD Song Plus'),
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
      vin: data['vin'],
    );
    _cars.add(car);
    return car;
  }

  @override
  Future<PageData<Bill>> bills({
    String query = '',
    int page = 1,
    BillView view = BillView.all,
  }) async {
    final q = query.trim().toLowerCase();
    final matches = _bills.reversed
        .where(
          (bill) =>
              billInView(bill, view) &&
              [
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
    if (mechanicMode) return null;
    final matches = _bills.where((b) => b.appointmentId == id);
    return matches.isEmpty ? null : matches.first;
  }

  @override
  Future<Bill> createBill(
    Work work,
    List<BillLine> lines,
    double taxRate, {
    bool send = true,
  }) async {
    final current = await this.work(work.id);
    if (current.status != WorkStatus.completed || lines.isEmpty) {
      throw const AppFailure('Avval servis ishini tugating.');
    }
    final existing = await billForWork(work.id);
    if (existing != null) return existing;
    final sums = invoiceTotals(lines, taxRate);
    final value = Bill(
      id: _uuid.v4(),
      code:
          'INV-${_today.year}-${(144 + _bills.length).toString().padLeft(6, '0')}',
      customerId: work.customerId,
      customerName: work.customerName,
      currency: 'UZS',
      status: send ? 'issued' : 'draft',
      total: Money(sums.total),
      paid: const Money(0),
      balance: Money(sums.total),
      subtotal: Money(sums.subtotal),
      tax: Money(sums.tax),
      discount: Money(sums.discount),
      appointmentId: work.id,
      vehicleLabel: work.vehicleLabel,
      lines: List.unmodifiable(lines),
      dueDate: _today.add(const Duration(days: 7)),
    );
    _bills.add(value);
    return value;
  }

  @override
  Future<Bill> sendBill(String id) async {
    final index = _bills.indexWhere((b) => b.id == id);
    final old = _bills[index];
    if (old.status != 'draft') return old;
    final value = Bill(
      id: old.id,
      code: old.code,
      customerId: old.customerId,
      customerName: old.customerName,
      currency: old.currency,
      status: 'issued',
      total: old.total,
      paid: old.paid,
      balance: old.balance,
      subtotal: old.subtotal,
      tax: old.tax,
      discount: old.discount,
      appointmentId: old.appointmentId,
      vehicleLabel: old.vehicleLabel,
      lines: old.lines,
      receipts: old.receipts,
      dueDate: old.dueDate,
    );
    _bills[index] = value;
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

  @override
  Future<List<Thread>> threads() async =>
      List.unmodifiable(_threads..sort((a, b) => b.time.compareTo(a.time)));

  @override
  Future<List<ChatMessage>> messages(String threadId) async {
    final index = _threads.indexWhere((t) => t.id == threadId);
    if (index >= 0 && _threads[index].unread > 0) {
      final t = _threads[index];
      _threads[index] = Thread(
        id: t.id,
        title: t.title,
        preview: t.preview,
        time: t.time,
        context: t.context,
        phone: t.phone,
      );
    }
    return List.unmodifiable(_messages[threadId] ?? const []);
  }

  @override
  Future<ChatMessage> sendMessage(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) async {
    final message = ChatMessage(
      id: _uuid.v4(),
      mine: true,
      author: 'Turon avtoservis',
      text: text.trim(),
      time: DateTime.now(),
      photos: photos,
    );
    (_messages[threadId] ??= []).add(message);
    final index = _threads.indexWhere((t) => t.id == threadId);
    if (index >= 0) {
      final t = _threads[index];
      _threads[index] = Thread(
        id: t.id,
        title: t.title,
        preview: message.text.isEmpty ? '📷' : message.text,
        time: message.time,
        context: t.context,
        phone: t.phone,
      );
    }
    return message;
  }
}
