import 'package:timezone/data/latest.dart' as database;
import 'package:timezone/timezone.dart' as tz;

bool _initialized = false;

/// A server timestamp presented in the garage's IANA zone, independent of the
/// phone zone and including historical daylight-saving transitions.
DateTime serviceDate(dynamic value, String zone) {
  if (!_initialized) {
    database.initializeTimeZones();
    _initialized = true;
  }
  final parsed = DateTime.tryParse('$value');
  if (parsed == null) {
    return DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  }
  // A calendar-only value is already a civil service date, not an instant.
  if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch('$value')) return parsed;
  tz.Location location;
  try {
    location = tz.getLocation(zone);
  } catch (_) {
    location = tz.UTC;
  }
  return tz.TZDateTime.from(parsed.toUtc(), location);
}

DateTime serviceNowFor(DateTime value) =>
    value is tz.TZDateTime ? tz.TZDateTime.now(value.location) : DateTime.now();
