import 'package:uuid/uuid.dart';

import '../domain/models.dart';
import '../domain/portal.dart';
import 'api_client.dart';

abstract interface class CustomerBookingSource {
  Future<List<CustomerPortalVehicle>> vehicles();
  Future<DateTime> bookingToday();

  /// Start times offered for [date] in the garage's local time.
  Future<List<String>> slots(DateTime date);
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

/// Everything the customer panel reads or changes. Sources that are not
/// connected for a section throw [AppFailure.unavailable]; screens render a
/// calm "not available yet" state instead of inventing data.
abstract interface class CustomerPortal implements CustomerBookingSource {
  bool get isDemo;
  String get name;
  String get garageName;
  Future<CustomerProfile> profile();
  Future<HomeSummary> home();
  Future<List<PortalVehicle>> cars();
  Future<VehicleDetail> car(String id);
  Future<ServicePassport> passport(String vehicleId);
  Future<List<PortalAppointment>> appointments();
  Future<BillingOverview> billing();
  Future<Estimate> estimate(String id);
  Future<Estimate> decideEstimate(String id, {required bool approve});

  /// Posts a question in the estimate's conversation; returns its thread id.
  Future<String> askAboutEstimate(String id, String question);
  Future<PortalInvoice> invoice(String id);
  Future<List<Thread>> threads();
  Future<List<ChatMessage>> messages(String threadId);
  Future<ChatMessage> send(
    String threadId,
    String text, {
    List<String> photos = const [],
  });
  Future<RoadsideCase> requestRoadside({
    required String vehicleId,
    required RoadsideProblem problem,
    required GeoPoint location,
  });
  Future<RoadsideCase> roadside(String id);
  Future<void> changePassword(String current, String next);
  Future<void> deleteAccount({String? password});
  Future<LogoutOutcome> logout();
  void close();
}

/// Weekday workshop grid used where the API offers no customer slot list;
/// the server still validates the chosen time.
List<String> standardSlots() => [
  for (var minutes = 9 * 60; minutes <= 17 * 60 + 30; minutes += 30)
    '${(minutes ~/ 60).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}',
];

/// Uzbek sample data for the customer panel: Aziz Karimov at Turon
/// avtoservis. Never calls the live API.
class DemoCustomerPortal implements CustomerPortal {
  DemoCustomerPortal({DateTime? today}) {
    final day = civilDate(dateKey(today ?? DateTime.now()));
    _today = day;
    final cobalt = const PortalVehicle(
      id: 'v1',
      label: 'Chevrolet Cobalt',
      year: 2021,
      plate: '01A777AA',
      vin: 'XWBJA69V1MA012345',
      km: 84200,
      health: 82,
      nextService: 'Tormoz kolodkalari',
      nextServiceState: HealthState.dueSoon,
    );
    final byd = const PortalVehicle(
      id: 'v2',
      label: 'BYD Song Plus',
      year: 2024,
      plate: '01Z404EV',
      vin: 'LGXCE4CB0R0012477',
      km: 12400,
      health: 96,
      nextService: 'Shinalarni almashtirish',
      nextServiceState: HealthState.onTrack,
    );
    _cars.addAll([cobalt, byd]);
    const lines = [
      BillLine('Moy almashtirish', 1, Money(15000000)),
      BillLine('Motor moyi 5W-30, 1 L', 4, Money(18500000), kind: 'part'),
      BillLine('Moy filtri', 1, Money(9500000), kind: 'part'),
      BillLine('Havo filtri', 1, Money(12000000), kind: 'part'),
      BillLine('Kompyuter diagnostikasi', 1, Money(14500000)),
    ];
    _visits['v1'] = [
      ServiceVisit(
        date: day.subtract(const Duration(days: 2)),
        title: 'Moy almashtirish va filtrlar',
        km: 84200,
        garage: _garage.name,
        total: const Money(125000000),
      ),
      ServiceVisit(
        date: day.subtract(const Duration(days: 45)),
        title: 'Antifriz almashtirish',
        km: 81900,
        garage: _garage.name,
        total: const Money(18000000),
      ),
      ServiceVisit(
        date: day.subtract(const Duration(days: 120)),
        title: 'Shinalar balansi',
        km: 78900,
        garage: _garage.name,
        total: const Money(64000000),
      ),
      ServiceVisit(
        date: day.subtract(const Duration(days: 400)),
        title: 'Texnik koʻrik',
        km: 62000,
        garage: _garage.name,
      ),
    ];
    _visits['v2'] = [
      ServiceVisit(
        date: day.subtract(const Duration(days: 60)),
        title: 'Birinchi texnik xizmat',
        km: 10000,
        garage: _garage.name,
        total: const Money(35000000),
      ),
    ];
    _appointments.addAll([
      PortalAppointment(
        id: 'a1',
        date: day.add(const Duration(days: 1)),
        time: '14:30',
        status: WorkStatus.confirmed,
        vehicle: cobalt.label,
        plate: cobalt.plate,
        service: 'Tormoz kolodkalari',
      ),
      PortalAppointment(
        id: 'a2',
        date: day.subtract(const Duration(days: 2)),
        time: '10:00',
        status: WorkStatus.completed,
        vehicle: cobalt.label,
        plate: cobalt.plate,
        service: 'Moy almashtirish',
      ),
      PortalAppointment(
        id: 'a3',
        date: day.subtract(const Duration(days: 30)),
        time: '09:30',
        minutes: 30,
        status: WorkStatus.cancelled,
        vehicle: byd.label,
        plate: byd.plate,
        service: 'Diagnostika',
      ),
    ]);
    _estimates.add(
      Estimate(
        id: 'e1',
        code: 'EST-2026-000012',
        status: EstimateStatus.sent,
        date: day,
        vehicle: cobalt.label,
        plate: cobalt.plate,
        taxRate: 12,
        lines: const [
          BillLine('Old tormoz kolodkalari', 1, Money(38500000), kind: 'part'),
          BillLine('Tormoz suyuqligi DOT-4', 1, Money(9000000), kind: 'part'),
          BillLine('Kolodkalarni almashtirish', 1, Money(25000000)),
          BillLine('Disklarni yoʻnish', 2, Money(7500000)),
        ],
        subtotal: const Money(87500000),
        tax: const Money(10500000),
        total: const Money(98000000),
        notes:
            'Old kolodkalar 2 mm qolgan. Disklar yoʻnilsa yana 30 000 km yuradi.',
        threadId: 't1',
      ),
    );
    _invoices.addAll([
      PortalInvoice(
        id: 'i1',
        code: 'INV-2026-000142',
        status: 'partial',
        total: const Money(125000000),
        paid: const Money(50000000),
        balance: const Money(75000000),
        date: day.subtract(const Duration(days: 2)),
        dueDate: day.add(const Duration(days: 5)),
        vehicle: 'Chevrolet Cobalt (01A777AA)',
        lines: lines,
        payments: [
          Receipt(
            'r1',
            const Money(50000000),
            'cash',
            day.subtract(const Duration(days: 2)).add(const Duration(hours: 18)),
          ),
        ],
        link: 'https://garageos.uz/d/INV-2026-000142',
      ),
      PortalInvoice(
        id: 'i2',
        code: 'INV-2026-000104',
        status: 'overdue',
        total: const Money(18000000),
        paid: const Money(0),
        balance: const Money(18000000),
        date: day.subtract(const Duration(days: 45)),
        dueDate: day.subtract(const Duration(days: 38)),
        vehicle: 'Chevrolet Cobalt (01A777AA)',
        lines: const [BillLine('Antifriz almashtirish', 1, Money(18000000))],
        link: 'https://garageos.uz/d/INV-2026-000104',
      ),
      PortalInvoice(
        id: 'i3',
        code: 'INV-2026-000088',
        status: 'paid',
        total: const Money(64000000),
        paid: const Money(64000000),
        balance: const Money(0),
        date: day.subtract(const Duration(days: 120)),
        dueDate: day.subtract(const Duration(days: 113)),
        vehicle: 'Chevrolet Cobalt (01A777AA)',
        lines: const [
          BillLine('Shinalar balansi', 4, Money(4000000)),
          BillLine('Yozgi shinalar montaji', 1, Money(48000000)),
        ],
        payments: [
          Receipt(
            'r2',
            const Money(64000000),
            'card',
            day.subtract(const Duration(days: 120)).add(const Duration(hours: 16)),
          ),
        ],
        link: 'https://garageos.uz/d/INV-2026-000088',
      ),
    ]);
    _threads.addAll([
      Thread(
        id: 't1',
        title: _garage.name,
        preview: 'Smeta yubordik: EST-2026-000012.',
        time: day.add(const Duration(hours: 9, minutes: 40)),
        unread: 2,
        context: 'Cobalt · 01 A 777 AA',
        phone: _garage.phone,
      ),
      Thread(
        id: 't2',
        title: 'Usta Sherzod',
        preview: 'Mashinangiz tayyor, olib ketishingiz mumkin.',
        time: day.subtract(const Duration(days: 2, hours: -17)),
        context: 'Cobalt · 01 A 777 AA',
        phone: _garage.phone,
      ),
    ]);
    _messages['t1'] = [
      ChatMessage(
        id: 'm1',
        mine: true,
        text: 'Salom! Tormozlaganda gʻichirlayapti.',
        time: day.add(const Duration(hours: 8, minutes: 50)),
      ),
      ChatMessage(
        id: 'm2',
        mine: false,
        author: 'Usta Sherzod',
        text: 'Koʻrikdan soʻng old kolodkalar 2 mm qolgani aniqlandi.',
        time: day.add(const Duration(hours: 9, minutes: 35)),
        photos: const ['Old kolodka · 2 mm'],
      ),
      ChatMessage(
        id: 'm3',
        mine: false,
        author: _garage.name,
        text:
            'Smeta yubordik: EST-2026-000012. Tasdiqlasangiz ertaga 14:30 da almashtiramiz.',
        time: day.add(const Duration(hours: 9, minutes: 40)),
      ),
    ];
    _messages['t2'] = [
      ChatMessage(
        id: 'm4',
        mine: false,
        author: 'Usta Sherzod',
        text: 'Mashinangiz tayyor, olib ketishingiz mumkin.',
        time: day.subtract(const Duration(days: 2, hours: -17)),
      ),
      ChatMessage(
        id: 'm5',
        mine: true,
        text: 'Rahmat, 18:00 da boraman.',
        time: day.subtract(const Duration(days: 2, hours: -17, minutes: -10)),
      ),
    ];
  }

  static const _uuid = Uuid();
  late final DateTime _today;
  static const _garage = GarageContact(
    name: 'Turon avtoservis',
    address: 'Chilonzor, Toshkent',
    phone: '+998712004545',
    hours: '08:00–20:00',
  );
  final _cars = <PortalVehicle>[];
  final _visits = <String, List<ServiceVisit>>{};
  final _appointments = <PortalAppointment>[];
  final _estimates = <Estimate>[];
  final _invoices = <PortalInvoice>[];
  final _threads = <Thread>[];
  final _messages = <String, List<ChatMessage>>{};
  final _cases = <String, RoadsideCase>{};

  @override
  bool get isDemo => true;
  @override
  String get name => 'Aziz Karimov';
  @override
  String get garageName => _garage.name;

  @override
  Future<CustomerProfile> profile() async => const CustomerProfile(
    name: 'Aziz Karimov',
    phone: '+998901234567',
    email: 'aziz.karimov@example.com',
    garage: _garage,
  );

  @override
  Future<HomeSummary> home() async {
    final upcoming = _appointments.where((a) => a.upcoming).toList()
      ..sort((a, b) => '${a.date}${a.time}'.compareTo('${b.date}${b.time}'));
    final pending = _estimates.where((e) => e.status == EstimateStatus.sent);
    final open = _cases.values.where((c) => c.open);
    return HomeSummary(
      firstName: 'Aziz',
      garage: _garage.name,
      next: upcoming.isEmpty ? null : upcoming.first,
      estimate: pending.isEmpty ? null : pending.first,
      unread: _threads.fold<int>(0, (sum, t) => sum + t.unread),
      vehicle: _cars.first,
      roadside: open.isEmpty ? null : open.last,
    );
  }

  @override
  Future<List<PortalVehicle>> cars() async => List.unmodifiable(_cars);

  @override
  Future<VehicleDetail> car(String id) async {
    final vehicle = _cars.firstWhere((c) => c.id == id);
    final cobalt = id == 'v1';
    return VehicleDetail(
      vehicle,
      categories: [
        HealthCategory(HealthArea.engine, cobalt ? 88 : 97),
        HealthCategory(HealthArea.brakes, cobalt ? 58 : 95),
        HealthCategory(HealthArea.tires, cobalt ? 79 : 94),
        HealthCategory(HealthArea.transmission, cobalt ? 92 : 98),
        HealthCategory(HealthArea.general, cobalt ? 41 : 96),
      ],
      due: cobalt
          ? [
              const DueService(
                'Tormoz kolodkalari',
                HealthState.dueSoon,
                dueKm: 85000,
              ),
              DueService(
                'Texnik koʻrik',
                HealthState.overdue,
                dueDate: _today.subtract(const Duration(days: 35)),
              ),
              const DueService(
                'Moy almashtirish',
                HealthState.onTrack,
                dueKm: 92000,
              ),
            ]
          : [
              const DueService(
                'Shinalarni almashtirish',
                HealthState.onTrack,
                dueKm: 20000,
              ),
            ],
      visits: _visits[id] ?? const [],
    );
  }

  @override
  Future<ServicePassport> passport(String vehicleId) async {
    final vehicle = _cars.firstWhere((c) => c.id == vehicleId);
    return ServicePassport(
      vehicle: vehicle,
      verified: true,
      garage: '${_garage.name}, ${_garage.address}',
      visits: _visits[vehicleId] ?? const [],
      link: 'https://garageos.uz/p/${vehicle.plate}',
      issued: _today,
    );
  }

  @override
  Future<List<PortalAppointment>> appointments() async =>
      List.unmodifiable(_appointments);

  @override
  Future<BillingOverview> billing() async => BillingOverview(
    owed: Money(_invoices.fold(0, (sum, i) => sum + i.balance.cents)),
    estimates: _estimates
        .where((e) => e.status == EstimateStatus.sent)
        .toList(),
    invoices: List.unmodifiable(_invoices),
    receipts: [
      for (final invoice in _invoices)
        for (final receipt in invoice.payments) (invoice.code, receipt),
    ]..sort((a, b) => b.$2.date!.compareTo(a.$2.date!)),
  );

  @override
  Future<Estimate> estimate(String id) async =>
      _estimates.firstWhere((e) => e.id == id);

  @override
  Future<Estimate> decideEstimate(String id, {required bool approve}) async {
    final index = _estimates.indexWhere((e) => e.id == id);
    final value = _estimates[index].withStatus(
      approve ? EstimateStatus.approved : EstimateStatus.rejected,
    );
    _estimates[index] = value;
    return value;
  }

  @override
  Future<String> askAboutEstimate(String id, String question) async {
    final estimate = await this.estimate(id);
    final thread = estimate.threadId ?? 't1';
    await send(thread, '${estimate.code}: $question');
    return thread;
  }

  @override
  Future<PortalInvoice> invoice(String id) async =>
      _invoices.firstWhere((i) => i.id == id);

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
  Future<ChatMessage> send(
    String threadId,
    String text, {
    List<String> photos = const [],
  }) async {
    if (photos.length > 5) {
      throw const AppFailure('Bir xabarda 5 tagacha rasm yuborish mumkin.');
    }
    final message = ChatMessage(
      id: _uuid.v4(),
      mine: true,
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

  @override
  Future<RoadsideCase> requestRoadside({
    required String vehicleId,
    required RoadsideProblem problem,
    required GeoPoint location,
  }) async {
    final vehicle = _cars.firstWhere((c) => c.id == vehicleId);
    final value = RoadsideCase(
      id: 'sos-${_cases.length + 1}',
      vehicle: vehicle.label,
      plate: vehicle.plate,
      problem: problem,
      stage: RoadsideStage.created,
      location: location,
      created: DateTime.now(),
      threadId: 't1',
    );
    _cases[value.id] = value;
    return value;
  }

  /// Each check moves the sample case one step along the tracker.
  @override
  Future<RoadsideCase> roadside(String id) async {
    final old = _cases[id]!;
    final next = RoadsideStage.values[(old.stage.index + 1).clamp(
      0,
      RoadsideStage.values.length - 1,
    )];
    final value = RoadsideCase(
      id: old.id,
      vehicle: old.vehicle,
      plate: old.plate,
      problem: old.problem,
      stage: next,
      location: old.location,
      created: old.created,
      threadId: old.threadId,
      mechanic: next.index >= RoadsideStage.assigned.index
          ? 'Usta Sherzod'
          : null,
      etaMinutes: next == RoadsideStage.onTheWay ? 18 : null,
    );
    _cases[id] = value;
    return value;
  }

  @override
  Future<void> changePassword(String current, String next) async {
    if (next.length < 10) {
      throw const AppFailure('Kamida 10 ta belgi kiriting.');
    }
  }

  @override
  Future<void> deleteAccount({String? password}) async {}

  @override
  Future<List<CustomerPortalVehicle>> vehicles() async => [
    for (final car in _cars)
      CustomerPortalVehicle(id: car.id, label: '${car.label} (${car.plate})'),
  ];

  @override
  Future<DateTime> bookingToday() async => _today;

  @override
  Future<List<String>> slots(DateTime date) async {
    final taken = date.weekday == DateTime.sunday
        ? standardSlots().toSet()
        : {'10:00', '11:30', '14:30', '15:00'};
    return standardSlots().where((s) => !taken.contains(s)).toList();
  }

  @override
  Future<Json> bookAppointment({
    required String vehicleId,
    required String service,
    required DateTime date,
    required String time,
  }) async {
    final vehicle = _cars.firstWhere((c) => c.id == vehicleId);
    final id = _uuid.v4();
    _appointments.add(
      PortalAppointment(
        id: id,
        date: date,
        time: time,
        status: WorkStatus.pending,
        vehicle: vehicle.label,
        plate: vehicle.plate,
        service: service.trim(),
      ),
    );
    return {'id': id, 'status': 'pending'};
  }

  @override
  Future<LogoutOutcome> logout() async => LogoutOutcome.none;
  @override
  void close() {}
}
