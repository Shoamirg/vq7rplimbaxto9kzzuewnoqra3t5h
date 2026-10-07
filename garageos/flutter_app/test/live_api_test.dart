import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/domain/models.dart';

void main() {
  const enabled = bool.fromEnvironment('RUN_LIVE_API');
  test(
    'real FastAPI: server permissions reach the signed-in Flutter account',
    () async {
      final originalPreferences = SharedPreferencesAsyncPlatform.instance;
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
      addTearDown(
        () => SharedPreferencesAsyncPlatform.instance = originalPreferences,
      );
      final fixture = jsonDecode(
        await File(const String.fromEnvironment('SMOKE_FIXTURE'))
            .readAsString(),
      );
      const address = String.fromEnvironment(
        'API_URL',
        defaultValue: 'http://127.0.0.1:8010/api/v1',
      );
      final operator = AppState();
      final mechanic = AppState();
      addTearDown(operator.dispose);
      addTearDown(mechanic.dispose);
      await operator.login(address, fixture['email'], fixture['password']);
      expect(operator.repository!.canWrite, isTrue);
      await mechanic.login(
        address,
        fixture['read_only_email'],
        fixture['password'],
      );
      expect(mechanic.repository!.canWrite, isFalse);
      expect(
        (await mechanic.repository!.works()).total,
        greaterThanOrEqualTo(0),
      );
      await expectLater(
        mechanic.repository!.createCustomer(
          'Forbidden from mechanic account',
          '+998900000099',
        ),
        throwsA(
          isA<AppFailure>().having(
            (e) => e.status,
            'server permission enforcement',
            403,
          ),
        ),
      );
    },
    skip: !enabled,
  );
  test(
    'real FastAPI: intake -> assigned work -> one UZS invoice -> payments, tenant isolation',
    () async {
      final fixture = jsonDecode(
        await File(const String.fromEnvironment('SMOKE_FIXTURE'))
            .readAsString(),
      );
      final api = ApiClient(
        const String.fromEnvironment(
          'API_URL',
          defaultValue: 'http://127.0.0.1:8010/api/v1',
        ),
      );
      addTearDown(api.close);
      final token = await api.request(
        'POST',
        '/auth/login',
        authenticated: false,
        body: {'email': fixture['email'], 'password': fixture['password']},
      );
      api.accessToken = token['access_token'];
      api.refreshToken = token['refresh_token'];
      final me = await api.request('GET', '/auth/me');
      expect(me['full_name'], 'Flutter QA xodim');
      final repo = LiveRepository(api);
      final stamp = DateTime.now().microsecondsSinceEpoch;
      final customer = await repo.createCustomer(
        'Flutter sinov $stamp',
        '+99890${(stamp % 10000000).toString().padLeft(7, '0')}',
      );
      final models = await repo.catalog();
      expect(models, isNotEmpty);
      final car = await repo.createCar({
        'customer_id': customer.id,
        'vehicle_model_id': models.first.id,
        'license_plate': '01F${(stamp % 1000).toString().padLeft(3, '0')}FT',
        'year': 2024,
        'current_km': 40000,
      });
      expect((await repo.cars(customer.id)).single.id, car.id);
      await expectLater(
        repo.cars(fixture['other_customer_id']),
        throwsA(
          isA<AppFailure>().having((e) => e.status, 'tenant boundary', 404),
        ),
      );
      final work = await repo.createWork({
        'customer_id': customer.id,
        'vehicle_id': car.id,
        'appointment_date': dateKey(
          DateTime.now().add(const Duration(days: 2)),
        ),
        'appointment_time': '16:30',
        'estimated_duration_minutes': 60,
        'customer_notes': 'Tormoz shovqini',
      });
      expect(work.customerNotes, 'Tormoz shovqini');
      expect((await repo.works(query: '$stamp')).items.single.id, work.id);
      await repo.changeWork(work.id, 'confirm');
      await expectLater(
        repo.changeWork(work.id, 'start'),
        throwsA(
          isA<AppFailure>().having((e) => e.status, 'requires mechanic', 409),
        ),
      );
      final account = (await repo.mechanics()).singleWhere(
        (m) => m.email == fixture['read_only_email'],
      );
      final bookedWithAccount = await repo.createWork({
        'customer_id': customer.id,
        'vehicle_id': car.id,
        'appointment_date': dateKey(
          DateTime.now().add(const Duration(days: 3)),
        ),
        'appointment_time': '16:30',
        'estimated_duration_minutes': 60,
        'mechanic_user_id': account.id,
      });
      expect(bookedWithAccount.mechanicUserId, account.id);
      expect(bookedWithAccount.mechanic, account.name);
      expect(
        (await repo.work(bookedWithAccount.id)).mechanicUserId,
        account.id,
      );
      await repo.changeWork(bookedWithAccount.id, 'cancel', {
        'reason': 'Booking QA complete',
      });
      await repo.changeWork(work.id, 'assign-mechanic', {
        'mechanic_user_id': account.id,
      });
      final mechanicApi = ApiClient(api.base.toString());
      addTearDown(mechanicApi.close);
      final mechanicToken = await mechanicApi.request(
        'POST',
        '/auth/login',
        authenticated: false,
        body: {
          'email': fixture['read_only_email'],
          'password': fixture['password'],
        },
      );
      mechanicApi.accessToken = mechanicToken['access_token'];
      mechanicApi.refreshToken = mechanicToken['refresh_token'];
      final mechanicRepo = LiveRepository(
        mechanicApi,
        canWrite: false,
        isMechanic: true,
      );
      expect(
        (await mechanicRepo.works(query: '$stamp')).items.map((w) => w.id),
        unorderedEquals([work.id, bookedWithAccount.id]),
      );
      await mechanicRepo.changeWork(work.id, 'start');
      final done = await mechanicRepo.changeWork(work.id, 'complete', {
        'service_type': 'Diagnostika',
        'notes': 'Tormoz tizimi tekshirildi',
        'odometer_km': 40100,
      });
      expect(done.status, WorkStatus.completed);
      expect(done.notes, 'Tormoz tizimi tekshirildi');
      expect(await repo.billForWork(work.id), isNull);
      final lines = [
        BillLine('Diagnostika', 1.5, const Money(10000000)),
        BillLine('Kolodka', 1, const Money(25000000), kind: 'part'),
      ];
      final bill = await repo.createBill(done, lines, 12);
      expect(bill.currency, 'UZS');
      expect(bill.total.cents, 44800000);
      expect((await repo.createBill(done, lines, 12)).id, bill.id);
      expect((await repo.billForWork(work.id))!.id, bill.id);
      final key = const Uuid().v4();
      final partial = await repo.pay(
        bill.id,
        const Money(10000000),
        'cash',
        key,
      );
      expect(partial.status, 'partial');
      expect(partial.receipts.length, 1);
      final repeat = await repo.pay(
        bill.id,
        const Money(10000000),
        'cash',
        key,
      );
      expect(repeat.receipts.length, 1);
      expect(repeat.balance.cents, 34800000);
      final paid = await repo.pay(
        bill.id,
        repeat.balance,
        'card',
        const Uuid().v4(),
      );
      expect(paid.status, 'paid');
      expect(paid.receipts.length, 2);
      expect(paid.balance.cents, 0);
      expect(
        (await repo.bills()).items
            .where((b) => b.appointmentId == work.id)
            .length,
        1,
      );
      final searched = await repo.bills(query: bill.code.toLowerCase());
      expect(searched.total, 1);
      expect(searched.page, 1);
      expect(searched.size, 30);
      expect(searched.items.single.id, bill.id);
      expect((await repo.bills(query: '%')).items, isEmpty);
      final customerEmail = 'customer-$stamp@example.com';
      await api.request(
        'POST',
        '/customers/${work.customerId}/account',
        body: {'email': customerEmail, 'password': fixture['password']},
      );
      final customerState = AppState();
      addTearDown(customerState.dispose);
      await customerState.login(
        api.base.toString(),
        customerEmail,
        fixture['password'],
        customer: true,
      );
      expect(customerState.repository, isNull);
      final customerRepo = customerState.customerRepository!;
      expect((await customerRepo.history('vehicles')).total, 1);
      expect(
        (await customerRepo.history('appointments')).items.map((w) => w['id']),
        unorderedEquals([work.id, bookedWithAccount.id]),
      );
      expect(
        (await customerRepo.history('invoices')).items.single['id'],
        bill.id,
      );
      final customerBill = await customerRepo.invoice(bill.id);
      expect(customerBill['balance'], 0);
      expect((customerBill['payments'] as List).length, 2);
      expect(customerBill.containsKey('notes'), isFalse);
      await api.request(
        'PATCH',
        '/customers/${work.customerId}/account',
        body: {'is_active': false},
      );
      await expectLater(
        customerRepo.history('vehicles'),
        throwsA(
          isA<AppFailure>().having((e) => e.status, 'suspended customer', 401),
        ),
      );
    },
    skip: !enabled,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
