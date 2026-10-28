import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/domain/service_time.dart';
import 'package:garageos_staff/domain/models.dart';

void main() {
  test('timestamps use the garage zone across midnight, independent of device zone', () {
    final time = serviceDate('2026-10-25T22:30:00Z', 'Asia/Tashkent');
    expect(dateKey(time), '2026-10-26');
    expect(time.hour, 3);
    expect(time.minute, 30);
    expect(time.toUtc(), DateTime.utc(2026, 10, 25, 22, 30));
  });
  test(
    'IANA rules apply daylight saving at the timestamp and keep civil dates',
    () {
      expect(serviceDate('2026-07-01T12:00:00Z', 'America/New_York').hour, 8);
      expect(serviceDate('2026-01-01T12:00:00Z', 'America/New_York').hour, 7);
      expect(
        dateKey(serviceDate('2026-07-01', 'America/New_York')),
        '2026-07-01',
      );
    },
  );
}
