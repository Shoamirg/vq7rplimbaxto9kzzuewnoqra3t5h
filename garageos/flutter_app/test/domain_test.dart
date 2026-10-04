import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/data/api_client.dart';

void main() {
  test('money preserves currency, minor units and bounded input', () {
    expect(Money.parse('1 180 000')!.cents, 118000000);
    expect(Money.parse('0,10')!.cents, 10);
    expect(Money.fromApi(0.1).cents, 10);
    expect(const Money(118000000).format(), '1 180 000 soʻm');
    expect(const Money(2510).format('USD'), '25,10 USD');
    expect(const Money(123).format(), '1,23 soʻm');
    for (final bad in [
      'NaN',
      'Infinity',
      '1e6',
      '-1',
      '1.234',
      '100000000',
      '1,2,3',
    ]) {
      expect(Money.parse(bad), isNull, reason: bad);
    }
  });
  test('civil appointment date does not shift to device timezone', () {
    expect(dateKey(civilDate('2026-10-01T00:00:00+05:00')), '2026-10-01');
    expect(WorkStatus.parse('quality_check'), WorkStatus.unknown);
  });
  test('persisted invoice line keeps the server override', () {
    final line = BillLine.fromJson({
      'description': 'Xizmat',
      'quantity': 1,
      'unit_price': 100,
      'line_total': 80,
      'kind': 'labor',
    });
    expect(line.total.cents, 8000);
    expect(BillLine('Xizmat', 1, const Money(10000)).total.cents, 10000);
  });
  test(
    'demo needs an assigned mechanic, creates one invoice, replays one payment',
    () async {
      final repo = DemoRepository();
      await repo.changeWork('w1', 'confirm');
      await expectLater(
        repo.changeWork('w1', 'start'),
        throwsA(isA<AppFailure>()),
      );
      await repo.changeWork('w1', 'assign-mechanic', {
        'mechanic_name': 'Sherzod',
      });
      await repo.changeWork('w1', 'start');
      await expectLater(
        repo.changeWork('w1', 'assign-mechanic', {
          'mechanic_name': 'Boshqa usta',
        }),
        throwsA(isA<AppFailure>()),
      );
      final done = await repo.changeWork('w1', 'complete', {
        'notes': 'Tekshirildi',
      });
      final lines = [BillLine('Diagnostika', 1, const Money(30000000))];
      final bill = await repo.createBill(done, lines, 12);
      final duplicate = await repo.createBill(done, lines, 12);
      expect(duplicate.id, bill.id);
      expect((await repo.bills()).items.length, 1);
      expect(bill.total.cents, 33600000);
      final first = await repo.pay(
        bill.id,
        const Money(10000000),
        'cash',
        'key-1',
      );
      expect(first.status, 'partial');
      final replay = await repo.pay(
        bill.id,
        const Money(10000000),
        'cash',
        'key-1',
      );
      expect(replay.receipts.length, 1);
      await expectLater(
        repo.pay(bill.id, const Money(10000001), 'cash', 'key-1'),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.pay(bill.id, const Money(99999999), 'card', 'key-2'),
        throwsA(isA<AppFailure>()),
      );
      final paid = await repo.pay(bill.id, first.balance, 'card', 'key-3');
      expect(paid.status, 'paid');
      expect(paid.balance.cents, 0);
    },
  );
  test('demo customer, vehicle and overlapping appointment checks', () async {
    final repo = DemoRepository();
    final customer = await repo.createCustomer(
      'Yangi mijoz',
      '+998 90 123 00 11',
    );
    await expectLater(
      repo.createCustomer('Takror', '998901230011'),
      throwsA(isA<AppFailure>()),
    );
    final car = await repo.createCar({
      'customer_id': customer.id,
      'vehicle_model_id': 'm1',
      'license_plate': '01 Z 111 ZZ',
      'year': 2024,
      'current_km': 1000,
    });
    final body = {
      'customer_id': customer.id,
      'vehicle_id': car.id,
      'appointment_date': dateKey(DateTime.now()),
      'appointment_time': '15:00',
      'estimated_duration_minutes': 60,
      'mechanic_name': 'Yangi usta',
    };
    await repo.createWork(body);
    await expectLater(
      repo.createWork({...body, 'appointment_time': '15:30'}),
      throwsA(isA<AppFailure>()),
    );
    final page = await repo.customers(query: '1230011');
    expect(page.total, 1);
    expect((await repo.cars(customer.id)).single.plate, '01Z111ZZ');
  });
}
