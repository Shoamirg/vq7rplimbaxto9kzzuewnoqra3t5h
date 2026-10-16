// These models follow FastAPI contracts; design-only job states are not invented.
typedef Json = Map<String, dynamic>;

String dateKey(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
DateTime civilDate(String value) => DateTime.parse(value.substring(0, 10));
String dateLabel(DateTime date) {
  const months = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ];
  return '${date.day}-${months[date.month - 1]}, ${date.year}';
}

/// Integer minor units in the UI. The server remains authoritative.
class Money {
  const Money(this.cents);
  final int cents;
  static const maxCents = 9999999999;
  static Money fromApi(dynamic value) {
    final number = num.parse('${value ?? 0}');
    if (!number.isFinite) throw const FormatException('Invalid money');
    return Money((number * 100).round());
  }

  static Money? parse(String value) {
    final input = value
        .replaceAll(RegExp(r'[\s\u00a0\u202f]'), '')
        .replaceAll(',', '.');
    if (!RegExp(r'^\d{1,8}(\.\d{1,2})?$').hasMatch(input)) return null;
    final parts = input.split('.');
    final cents =
        int.parse(parts.first) * 100 +
        (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
    return cents <= maxCents ? Money(cents) : null;
  }

  double get apiValue => cents / 100;
  String input(String currency) => currency == 'UZS' && cents % 100 == 0
      ? '${cents ~/ 100}'
      : apiValue.toStringAsFixed(2);
  String format([String currency = 'UZS']) {
    final absolute = cents.abs();
    final whole = '${absolute ~/ 100}'.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]} ',
    );
    final fraction = currency != 'UZS' || absolute % 100 != 0
        ? ',${(absolute % 100).toString().padLeft(2, '0')}'
        : '';
    return '${cents < 0 ? '−' : ''}$whole$fraction ${currency == 'UZS' ? 'soʻm' : currency}';
  }
}

class PageData<T> {
  const PageData(this.items, this.total, this.page, {this.size = 30});
  final List<T> items;
  final int total, page, size;
  bool get hasNext => page * size < total;
}

enum WorkStatus {
  pending('pending', 'Tasdiq kutilmoqda'),
  confirmed('confirmed', 'Tasdiqlangan'),
  inProgress('in_progress', 'Servisda'),
  completed('completed', 'Tugagan'),
  cancelled('cancelled', 'Bekor qilingan'),
  rescheduled('rescheduled', 'Koʻchirilgan'),
  unknown('', 'Boshqa holat');

  const WorkStatus(this.code, this.label);
  final String code, label;
  static WorkStatus parse(String code) =>
      values.firstWhere((s) => s.code == code, orElse: () => unknown);
}

class Work {
  const Work({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.vehicleId,
    required this.vehicleLabel,
    required this.date,
    required this.time,
    required this.duration,
    required this.status,
    this.mechanic,
    this.mechanicUserId,
    this.finalInvoiceId,
    this.awaitingInvoice,
    this.notes,
    this.customerNotes,
    this.serviceType,
  });
  factory Work.fromJson(Json j) => Work(
    id: j['id'],
    customerId: j['customer_id'],
    customerName: j['customer_name'] ?? '',
    vehicleId: j['vehicle_id'],
    vehicleLabel: j['vehicle_summary'] ?? '',
    date: civilDate(j['appointment_local_date'] ?? j['appointment_date']),
    time: j['appointment_time'],
    duration: j['estimated_duration_minutes'] ?? 60,
    status: WorkStatus.parse(j['status']),
    mechanic: j['mechanic_name'],
    mechanicUserId: j['mechanic_user_id'],
    finalInvoiceId: j['final_invoice_id'],
    awaitingInvoice: j['awaiting_invoice'],
    notes: j['notes'],
    customerNotes: j['customer_notes'],
    serviceType: j['service_type'],
  );
  final String id, customerId, customerName, vehicleId, vehicleLabel, time;
  final DateTime date;
  final int duration;
  final WorkStatus status;
  final String? mechanic, notes, customerNotes, serviceType;
  final String? mechanicUserId;
  final String? finalInvoiceId;
  final bool? awaitingInvoice;
  String? get plate =>
      RegExp(r'\(([^)]+)\)\s*$').firstMatch(vehicleLabel)?.group(1);
  String get car => vehicleLabel.replaceFirst(RegExp(r'\s*\([^)]+\)\s*$'), '');
  bool get canCancel =>
      status == WorkStatus.pending || status == WorkStatus.confirmed;
  bool get canAssignMechanic => canCancel;
  Work changed({
    WorkStatus? status,
    String? mechanic,
    String? mechanicUserId,
    String? notes,
    String? finalInvoiceId,
    bool? awaitingInvoice,
  }) => Work(
    id: id,
    customerId: customerId,
    customerName: customerName,
    vehicleId: vehicleId,
    vehicleLabel: vehicleLabel,
    date: date,
    time: time,
    duration: duration,
    status: status ?? this.status,
    mechanic: mechanic ?? this.mechanic,
    mechanicUserId: mechanic != null ? mechanicUserId : this.mechanicUserId,
    finalInvoiceId: awaitingInvoice != null
        ? finalInvoiceId
        : this.finalInvoiceId,
    awaitingInvoice: awaitingInvoice ?? this.awaitingInvoice,
    notes: notes ?? this.notes,
    customerNotes: customerNotes,
    serviceType: serviceType,
  );
}

class Mechanic {
  const Mechanic(this.id, this.name, this.email);
  factory Mechanic.fromJson(Json j) =>
      Mechanic(j['id'], j['full_name'], j['email']);
  final String id, name, email;
}

class Customer {
  const Customer(this.id, this.name, this.phone, {this.vehicleCount = 0});
  factory Customer.fromJson(Json j) => Customer(
    j['id'],
    j['full_name'],
    j['phone'] ?? '',
    vehicleCount: j['vehicle_count'] ?? 0,
  );
  final String id, name, phone;
  final int vehicleCount;
}

class Car {
  const Car(
    this.id,
    this.customerId,
    this.label,
    this.plate,
    this.year,
    this.km,
  );
  factory Car.fromJson(Json j, String customerId) => Car(
    j['id'],
    customerId,
    j['label'] ?? '${j['brand'] ?? ''} ${j['model'] ?? ''}'.trim(),
    j['license_plate'],
    j['year'] ?? 0,
    j['current_km'] ?? 0,
  );
  final String id, customerId, label;
  final String? plate;
  final int year, km;
  String get modelLabel => label.replaceFirst(RegExp(r'\s*\([^)]+\)\s*$'), '');
}

class CarModel {
  const CarModel(this.id, this.label);
  final String id, label;
}

class BillLine {
  const BillLine(
    this.description,
    this.quantity,
    this.price, {
    this.kind = 'labor',
    this.recordedTotal,
  });
  factory BillLine.fromJson(Json j) => BillLine(
    j['description'],
    (j['quantity'] as num).toDouble(),
    Money.fromApi(j['unit_price']),
    kind: j['kind'],
    recordedTotal: j['line_total'] == null
        ? null
        : Money.fromApi(j['line_total']),
  );
  final String description, kind;
  final double quantity;
  final Money price;
  final Money? recordedTotal;
  Money get total => recordedTotal ?? Money((quantity * price.cents).round());
  Json toJson() => {
    'description': description,
    'quantity': quantity,
    'unit_price': price.apiValue,
    'kind': kind,
    'taxable': true,
  };
}

class Receipt {
  const Receipt(
    this.id,
    this.amount,
    this.method,
    this.date, {
    this.kind = 'payment',
  });
  factory Receipt.fromJson(Json j) => Receipt(
    j['id'],
    Money.fromApi(j['amount']),
    j['method'],
    DateTime.tryParse(j['received_at'] ?? ''),
    kind: j['kind'],
  );
  final String id, method, kind;
  final Money amount;
  final DateTime? date;
}

String paymentLabel(String code) => switch (code) {
  'cash' => 'Naqd',
  'card' => 'Terminal / karta',
  'bank_transfer' => 'Bank oʻtkazma',
  'online' => 'Onlayn',
  _ => 'Boshqa',
};
String billStatusLabel(String code) => switch (code) {
  'issued' => 'Toʻlanmagan',
  'partial' => 'Qisman toʻlangan',
  'paid' => 'Toʻlangan',
  'overdue' => 'Muddati oʻtgan',
  'void' => 'Bekor qilingan',
  'refunded' => 'Qaytarilgan',
  'draft' => 'Qoralama',
  'sent' => 'Yuborilgan',
  _ => 'Boshqa holat',
};

class Bill {
  const Bill({
    required this.id,
    required this.code,
    required this.customerId,
    required this.customerName,
    required this.currency,
    required this.status,
    required this.total,
    required this.paid,
    required this.balance,
    required this.subtotal,
    required this.tax,
    required this.discount,
    this.appointmentId,
    this.vehicleLabel = '',
    this.lines = const [],
    this.receipts = const [],
    this.dueDate,
  });
  factory Bill.fromJson(Json j) => Bill(
    id: j['id'],
    code: j['code'],
    customerId: j['customer_id'],
    customerName: j['customer_name'] ?? '',
    currency: j['currency'] ?? 'USD',
    status: j['status'],
    total: Money.fromApi(j['total']),
    paid: Money.fromApi(j['amount_paid']),
    balance: Money.fromApi(j['balance']),
    subtotal: Money.fromApi(j['subtotal']),
    tax: Money.fromApi(j['tax_total']),
    discount: Money.fromApi(j['discount_total']),
    appointmentId: j['appointment_id'],
    vehicleLabel: j['vehicle_label'] ?? '',
    lines: (j['line_items'] as List? ?? [])
        .map((v) => BillLine.fromJson(v))
        .toList(),
    receipts: (j['payments'] as List? ?? [])
        .map((v) => Receipt.fromJson(v))
        .toList(),
    dueDate: j['due_date'] == null ? null : civilDate(j['due_date']),
  );
  final String id,
      code,
      customerId,
      customerName,
      currency,
      status,
      vehicleLabel;
  final String? appointmentId;
  final Money total, paid, balance, subtotal, tax, discount;
  final List<BillLine> lines;
  final List<Receipt> receipts;
  final DateTime? dueDate;
  bool get canPay =>
      balance.cents > 0 && ['issued', 'partial', 'overdue'].contains(status);
  Bill withPayment(Receipt receipt) {
    final newPaid = paid.cents + receipt.amount.cents;
    return Bill(
      id: id,
      code: code,
      customerId: customerId,
      customerName: customerName,
      currency: currency,
      status: newPaid == total.cents ? 'paid' : 'partial',
      total: total,
      paid: Money(newPaid),
      balance: Money(total.cents - newPaid),
      subtotal: subtotal,
      tax: tax,
      discount: discount,
      appointmentId: appointmentId,
      vehicleLabel: vehicleLabel,
      lines: lines,
      receipts: [...receipts, receipt],
      dueDate: dueDate,
    );
  }
}
