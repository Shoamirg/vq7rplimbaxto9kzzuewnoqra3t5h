import '../domain/models.dart';
import '../domain/portal.dart';
import '../domain/service_time.dart';

DateTime apiDate(dynamic value, {String timeZone = 'UTC'}) =>
    serviceDate(value, timeZone);

PortalVehicle portalVehicle(Json data) => PortalVehicle(
  id: '${data['id']}',
  label:
      data['label'] ?? '${data['brand'] ?? ''} ${data['model'] ?? ''}'.trim(),
  plate: data['plate'] ?? data['license_plate'],
  year: data['year'],
  vin: data['vin'],
  km: data['mileage'] ?? data['current_km'],
  health: (data['health_score'] as num?)?.round(),
);

List<BillLine> portalLines(Json data) => [
  for (final line in data['line_items'] ?? data['lines'] ?? const [])
    BillLine(
      '${line['description']}',
      (line['quantity'] as num).toDouble(),
      Money.fromApi(
        line['unit_price'] ??
            ((num.tryParse('${line['total']}') ?? 0) /
                ((num.tryParse('${line['quantity']}') ?? 1) == 0
                    ? 1
                    : num.parse('${line['quantity']}'))),
      ),
      recordedTotal: Money.fromApi(line['line_total'] ?? line['total']),
    ),
];

Estimate portalEstimate(Json data, {String timeZone = 'UTC'}) => Estimate(
  id: '${data['id']}',
  code: '${data['code']}',
  status: switch (data['status']) {
    'approved' => EstimateStatus.approved,
    'rejected' => EstimateStatus.rejected,
    _ => EstimateStatus.sent,
  },
  date: apiDate(data['created_at'], timeZone: timeZone),
  vehicle: data['vehicle_label'] ?? '',
  lines: portalLines(data),
  subtotal: Money.fromApi(data['subtotal'] ?? data['total']),
  tax: Money.fromApi(data['tax_total']),
  total: Money.fromApi(data['total']),
  taxRate: (data['tax_rate'] as num?)?.toDouble() ?? 0,
);

PortalInvoice portalInvoice(Json data, {String timeZone = 'UTC'}) {
  final total = Money.fromApi(data['total']);
  final balance = Money.fromApi(data['balance']);
  return PortalInvoice(
    id: '${data['id']}',
    code: '${data['code']}',
    status: data['status'] ?? (balance.cents == 0 ? 'paid' : 'issued'),
    currency: data['currency'] ?? 'UZS',
    total: total,
    balance: balance,
    paid: Money(total.cents - balance.cents),
    date: apiDate(data['created_at'], timeZone: timeZone),
    dueDate: DateTime.tryParse('${data['due_date']}'),
    vehicle: data['vehicle_label'] ?? '',
    lines: portalLines(data),
    payments: [
      for (final p in data['payments'] ?? const [])
        Receipt(
          '${p['id'] ?? p['received_at'] ?? p['date']}',
          Money.fromApi(p['amount']),
          p['method'] ?? 'cash',
          apiDate(p['received_at'] ?? p['date'], timeZone: timeZone),
          kind: p['kind'] ?? 'payment',
        ),
    ],
  );
}

Thread portalThread(Json data, {bool staff = false, String timeZone = 'UTC'}) =>
    Thread(
      id: '${data['id']}',
      title: data['subject'] ?? data['customer_name'] ?? 'GarageOS',
      preview: data['preview'] ?? data['last_message_preview'] ?? '',
      time: apiDate(
        data['last_message_at'] ?? data['created_at'],
        timeZone: timeZone,
      ),
      unread: staff
          ? ((data['unread_messages'] as num?)?.toInt() ?? 0)
          : (data['awaiting_you'] == true ? 1 : 0),
      context: data['vehicle_label'],
      phone: data['customer_phone'],
    );

ChatMessage portalMessage(
  Json data, {
  bool staff = false,
  String timeZone = 'UTC',
}) => ChatMessage(
  id: '${data['id']}',
  mine: staff ? data['author_role'] != 'customer' : data['from_me'] == true,
  text: data['body'] ?? '',
  time: apiDate(data['created_at'], timeZone: timeZone),
  author: data['author_name'],
  photos: [
    for (final a in data['attachments'] ?? const [])
      if (a['kind'] == 'photo' && a['url'] != null) '${a['url']}',
  ],
);

RoadsideCase portalRoadside(Json data, {String timeZone = 'UTC'}) =>
    RoadsideCase(
      id: '${data['id']}',
      vehicle: data['vehicle_label'] ?? data['title'] ?? '',
      problem:
          RoadsideProblem.values
              .where((p) => p.name == data['problem'])
              .firstOrNull ??
          RoadsideProblem.other,
      stage: switch (data['status']) {
        'acknowledged' => RoadsideStage.acknowledged,
        'assigned' => RoadsideStage.assigned,
        'en_route' => RoadsideStage.onTheWay,
        'in_progress' || 'waiting_customer' => RoadsideStage.inProgress,
        'resolved' || 'closed' => RoadsideStage.resolved,
        _ => RoadsideStage.created,
      },
      location: GeoPoint(
        (data['location_lat'] as num?)?.toDouble() ?? 0,
        (data['location_lng'] as num?)?.toDouble() ?? 0,
        address: data['location_text'],
      ),
      created: apiDate(data['created_at'], timeZone: timeZone),
      mechanic: data['assigned_name'],
      threadId: data['conversation_id'],
    );
