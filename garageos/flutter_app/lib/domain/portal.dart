// Customer portal, messaging and roadside models. Sample data and the live
// API both map into these; screens never read raw JSON.
import 'models.dart';

enum HealthState { onTrack, dueSoon, overdue }

HealthState healthStateOf(int score) => score >= 75
    ? HealthState.onTrack
    : score >= 50
    ? HealthState.dueSoon
    : HealthState.overdue;

String healthStateTone(HealthState state) => switch (state) {
  HealthState.onTrack => 'success',
  HealthState.dueSoon => 'warning',
  HealthState.overdue => 'danger',
};

/// Plate in parentheses at the end of an API vehicle label.
String? plateOf(String label) =>
    RegExp(r'\(([^)]+)\)\s*$').firstMatch(label)?.group(1);
String withoutPlate(String label) =>
    label.replaceFirst(RegExp(r'\s*\([^)]+\)\s*$'), '');

class PortalVehicle {
  const PortalVehicle({
    required this.id,
    required this.label,
    this.year,
    this.plate,
    this.vin,
    this.km,
    this.health,
    this.nextService,
    this.nextServiceState,
  });
  final String id, label;
  final int? year, km, health;
  final String? plate, vin, nextService;
  final HealthState? nextServiceState;
  String get title => year == null ? label : '$label $year';
}

enum HealthArea { engine, brakes, tires, transmission, general }

class HealthCategory {
  const HealthCategory(this.area, this.score);
  final HealthArea area;
  final int score;
  HealthState get state => healthStateOf(score);
}

class DueService {
  const DueService(this.title, this.state, {this.dueKm, this.dueDate});
  final String title;
  final HealthState state;
  final int? dueKm;
  final DateTime? dueDate;
}

class ServiceVisit {
  const ServiceVisit({
    required this.date,
    required this.title,
    this.km,
    this.garage,
    this.total,
  });
  final DateTime date;
  final String title;
  final int? km;
  final String? garage;
  final Money? total;
}

class VehicleDetail {
  const VehicleDetail(
    this.vehicle, {
    this.categories = const [],
    this.due = const [],
    this.visits = const [],
  });
  final PortalVehicle vehicle;
  final List<HealthCategory> categories;
  final List<DueService> due;
  final List<ServiceVisit> visits;
}

class ServicePassport {
  const ServicePassport({
    required this.vehicle,
    required this.verified,
    required this.garage,
    required this.visits,
    required this.link,
    required this.issued,
  });
  final PortalVehicle vehicle;
  final bool verified;
  final String garage, link;
  final List<ServiceVisit> visits;
  final DateTime issued;
}

class PortalAppointment {
  const PortalAppointment({
    required this.id,
    required this.date,
    required this.time,
    required this.status,
    this.minutes = 60,
    this.vehicle = '',
    this.plate,
    this.service,
  });
  final String id, time, vehicle;
  final DateTime date;
  final int minutes;
  final WorkStatus status;
  final String? plate, service;
  bool get upcoming => ![
    WorkStatus.completed,
    WorkStatus.cancelled,
  ].contains(status);
}

enum EstimateStatus { sent, approved, rejected }

class Estimate {
  const Estimate({
    required this.id,
    required this.code,
    required this.status,
    required this.date,
    required this.lines,
    required this.subtotal,
    required this.tax,
    required this.total,
    this.taxRate = 0,
    this.vehicle = '',
    this.plate,
    this.notes,
    this.threadId,
  });
  final String id, code, vehicle;
  final EstimateStatus status;
  final DateTime date;
  final List<BillLine> lines;
  final Money subtotal, tax, total;
  final double taxRate;
  final String? plate, notes, threadId;
  Estimate withStatus(EstimateStatus value) => Estimate(
    id: id,
    code: code,
    status: value,
    date: date,
    lines: lines,
    subtotal: subtotal,
    tax: tax,
    total: total,
    taxRate: taxRate,
    vehicle: vehicle,
    plate: plate,
    notes: notes,
    threadId: threadId,
  );
}

class PortalInvoice {
  const PortalInvoice({
    required this.id,
    required this.code,
    required this.status,
    required this.total,
    required this.paid,
    required this.balance,
    this.currency = 'UZS',
    this.date,
    this.dueDate,
    this.vehicle = '',
    this.lines = const [],
    this.payments = const [],
    this.link,
  });
  final String id, code, status, currency, vehicle;
  final Money total, paid, balance;
  final DateTime? date, dueDate;
  final List<BillLine> lines;
  final List<Receipt> payments;
  final String? link;
}

class BillingOverview {
  const BillingOverview({
    required this.owed,
    required this.estimates,
    required this.invoices,
    this.receipts = const [],
  });
  final Money owed;
  final List<Estimate> estimates;
  final List<PortalInvoice> invoices;

  /// Receipts paired with the invoice code they settled.
  final List<(String code, Receipt receipt)> receipts;
}

class GarageContact {
  const GarageContact({required this.name, this.address, this.phone, this.hours});
  final String name;
  final String? address, phone, hours;
}

class CustomerProfile {
  const CustomerProfile({
    required this.name,
    required this.garage,
    this.phone,
    this.email,
  });
  final String name;
  final String? phone, email;
  final GarageContact garage;
}

class HomeSummary {
  const HomeSummary({
    required this.firstName,
    required this.garage,
    this.next,
    this.estimate,
    this.unread,
    this.vehicle,
    this.roadside,
  });
  final String firstName, garage;
  final PortalAppointment? next;
  final Estimate? estimate;

  /// Null when messaging is not connected for this session.
  final int? unread;
  final PortalVehicle? vehicle;
  final RoadsideCase? roadside;
}

class Thread {
  const Thread({
    required this.id,
    required this.title,
    required this.preview,
    required this.time,
    this.unread = 0,
    this.context,
    this.phone,
  });
  final String id, title, preview;
  final DateTime time;
  final int unread;

  /// Linked car or job, shown as a pill.
  final String? context;
  final String? phone;
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.mine,
    required this.text,
    required this.time,
    this.author,
    this.photos = const [],
  });
  final String id, text;
  final bool mine;
  final DateTime time;
  final String? author;

  /// Photo captions; images arrive with the messaging API.
  final List<String> photos;
}

enum RoadsideProblem { wontStart, flatTyre, accident, other }

enum RoadsideStage { created, acknowledged, assigned, onTheWay, inProgress, resolved }

class GeoPoint {
  const GeoPoint(this.latitude, this.longitude, {this.address});
  final double latitude, longitude;
  final String? address;
}

class RoadsideCase {
  const RoadsideCase({
    required this.id,
    required this.vehicle,
    required this.problem,
    required this.stage,
    required this.location,
    required this.created,
    this.plate,
    this.mechanic,
    this.etaMinutes,
    this.threadId,
  });
  final String id, vehicle;
  final RoadsideProblem problem;
  final RoadsideStage stage;
  final GeoPoint location;
  final DateTime created;
  final String? plate, mechanic, threadId;
  final int? etaMinutes;
  bool get open => stage != RoadsideStage.resolved;
}

/// Reception view of one customer.
class CustomerFile {
  const CustomerFile({
    required this.customer,
    required this.cars,
    this.email,
    this.lifetimeValue,
    this.appLogin,
    this.jobs,
    this.bills,
  });
  final Customer customer;
  final List<Car> cars;
  final String? email;
  final Money? lifetimeValue;

  /// Null when the login status is unknown for this session.
  final bool? appLogin;
  final List<Work>? jobs;
  final List<Bill>? bills;
}

class AppLogin {
  const AppLogin(this.email, this.temporaryPassword);
  final String email, temporaryPassword;
}
