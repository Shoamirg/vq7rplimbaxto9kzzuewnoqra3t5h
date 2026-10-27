// Real emulator + real local API acceptance. No mock HTTP or demo repository.
// Compile only with an ignored --dart-define-from-file test fixture.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/main.dart';
import 'package:garageos_staff/data/accounts.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/customer_repository.dart';
import 'package:garageos_staff/data/repository.dart';
import 'package:garageos_staff/data/session.dart';
import 'package:garageos_staff/domain/models.dart';
import 'package:garageos_staff/domain/portal.dart';
import 'package:garageos_staff/design/qr.dart';
import 'package:garageos_staff/design/widgets.dart';
import 'package:garageos_staff/features/roadside/device_location.dart';
import 'package:garageos_staff/l10n/generated/app_localizations.dart';
import 'package:garageos_staff/ui/welcome.dart';
import 'package:garageos_staff/ui/sign_in.dart';
import 'package:garageos_staff/ui/sign_up.dart';
import 'package:garageos_staff/ui/forgot_password.dart';
import 'package:garageos_staff/ui/settings.dart';
import 'package:garageos_staff/ui/customers.dart';
import 'package:garageos_staff/ui/staff_home.dart';
import 'package:garageos_staff/ui/work_detail.dart';
import 'package:garageos_staff/ui/booking.dart';
import 'package:garageos_staff/ui/billing.dart';
import 'package:garageos_staff/ui/inbox.dart';
import 'package:garageos_staff/ui/chat.dart';
import 'package:garageos_staff/ui/customer/home.dart';
import 'package:garageos_staff/ui/customer/cars.dart';
import 'package:garageos_staff/ui/customer/appointments.dart';
import 'package:garageos_staff/ui/customer/billing.dart';
import 'package:garageos_staff/ui/customer/messages.dart';
import 'package:garageos_staff/ui/customer/roadside.dart';
import 'package:garageos_staff/ui/customer/profile.dart';
import 'package:garageos_staff/ui/customer_booking.dart';
import 'package:garageos_staff/ui/mechanic/jobs.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const address = String.fromEnvironment('API_URL');
  const encodedFixture = String.fromEnvironment('MVP_FIXTURE');
  final fixture = Map<String, dynamic>.from(
    jsonDecode(utf8.decode(base64Decode(encodedFixture))),
  );
  final tenant = fixture['tenants'][0];
  final password = fixture['password'] as String;
  final runId = DateTime.now().millisecondsSinceEpoch.toString();
  final evidence = Directory(
    '${Directory.systemTemp.path}/garageos-mvp-evidence',
  );
  final observed = <String, Map<String, dynamic>>{};
  var convertedSurface = false;

  setUpAll(() async {
    if (await evidence.exists()) await evidence.delete(recursive: true);
    await evidence.create(recursive: true);
  });

  Future<void> settle(WidgetTester tester) async {
    // Complete route transitions before checking for the new page's loaders.
    await tester.pump(const Duration(milliseconds: 450));
    for (var attempt = 0; attempt < 240; attempt++) {
      await tester.pump(const Duration(milliseconds: 100));
      if (find.byType(SkeletonPage).evaluate().isEmpty &&
          find.byType(CircularProgressIndicator).evaluate().isEmpty) {
        await tester.pump(const Duration(milliseconds: 250));
        break;
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    expect(tester.takeException(), isNull);
  }

  Future<void> capture(WidgetTester tester, String id, String name) async {
    await settle(tester);
    if (!convertedSurface) {
      await binding.convertFlutterSurfaceToImage();
      convertedSurface = true;
      await tester.pump();
    }
    final bytes = await binding.takeScreenshot('$id-$name');
    await evidence.create(recursive: true);
    await File('${evidence.path}/$id-$name.png').writeAsBytes(bytes);
    observed[id] = {
      'screen': name,
      'result': 'observed',
      'at': DateTime.now().toUtc().toIso8601String(),
    };
  }

  Future<void> show(WidgetTester tester, AppState state, Widget page) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await tester.pumpWidget(GarageApp(state: state));
    await settle(tester);
    final navigator = tester.state<NavigatorState>(
      find.byType(Navigator).first,
    );
    navigator.push(
      MaterialPageRoute<void>(builder: (_) => Scaffold(body: page)),
    );
    await settle(tester);
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    expect(finder, findsWidgets);
    await tester.ensureVisible(finder.first);
    await tester.tap(finder.first);
    await settle(tester);
  }

  testWidgets(
    '31 live screens, real roles, booking, drafts, payments, chat and roadside',
    (tester) async {
      expect(address, startsWith('http://10.0.2.2:8000/'));
      final ownerSession = await GarageSession.login(
        address,
        tenant['owner']['email'],
        password,
        onExpired: () {},
      );
      final owner = ownerSession.repository as LiveRepository;
      final staffState = AppState()
        ..repository = owner
        ..name = ownerSession.name
        ..garageName = ownerSession.garageName;
      final entryState = AppState();
      final s = await AppLocalizations.delegate.load(const Locale('uz'));
      final profile = await owner.createCustomer(
        'MVP Jonli $runId',
        '99893${runId.substring(runId.length - 7)}',
      );
      final appLogin = await owner.openAppLogin(
        profile.id,
        'mvp.live.$runId@example.com',
      );
      final portal = await CustomerRepository.login(
        address,
        appLogin.email,
        appLogin.temporaryPassword,
        onExpired: () {},
      );
      final customerState = AppState()
        ..customerRepository = portal
        ..name = portal.name
        ..garageName = portal.garageName;
      final catalog = await owner.catalog();
      final model = catalog.firstWhere(
        (model) => model.label.toLowerCase().contains('cobalt'),
        orElse: () => catalog.first,
      );
      final car = await owner.createCar({
        'customer_id': profile.id,
        'vehicle_model_id': model.id,
        'year': 2023,
        'license_plate': 'QA${runId.substring(runId.length - 8)}',
        'current_km': 45000,
      });
      final mechanicEmail = 'mvp.mechanic.$runId@example.com';
      final mechanicRecord = await owner.api.request(
        'POST',
        '/staff',
        body: {
          'full_name': 'MVP Usta $runId',
          'email': mechanicEmail,
          'password': password,
          'role': 'mechanic',
        },
      );
      final mechanicSession = await GarageSession.login(
        address,
        mechanicEmail,
        password,
        onExpired: () {},
      );
      final mechanic = mechanicSession.repository as LiveRepository;
      final mechanicState = AppState()
        ..repository = mechanic
        ..name = mechanicSession.name
        ..garageName = mechanicSession.garageName;
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        staffState.dispose();
        customerState.dispose();
        mechanicState.dispose();
        entryState.dispose();
      });

      // The business workflow runs through the same repositories the views use.
      final today = await portal.bookingToday();
      final booking = await portal.bookAppointment(
        vehicleId: car.id,
        service: 'MVP tormoz tekshiruvi',
        date: today.add(const Duration(days: 1)),
        time: '10:00',
      );
      var work = await owner.work(booking['id']);
      expect(work.status, WorkStatus.pending);
      work = await owner.changeWork(work.id, 'confirm');
      work = await owner.changeWork(work.id, 'assign-mechanic', {
        'mechanic_user_id': mechanicRecord['id'],
      });
      work = await mechanic.changeWork(work.id, 'start');
      work = await mechanic.changeWork(work.id, 'complete', {
        'service_type': 'Diagnostika',
        'notes': 'MVP real emulator workflow',
        'odometer_km': 45000,
      });
      expect(work.status, WorkStatus.completed);
      var bill = await owner.createBill(
        work,
        [const BillLine('MVP diagnostika', 1, Money(30000000))],
        0,
        send: false,
      );
      expect(bill.status, 'draft');
      expect(
        (await portal.billing()).invoices.any((row) => row.id == bill.id),
        isFalse,
      );
      bill = await owner.sendBill(bill.id);
      expect(bill.status, 'issued');
      bill = await owner.pay(
        bill.id,
        const Money(10000000),
        'cash',
        '00000000-0000-4000-8000-${runId.substring(runId.length - 12)}',
      );
      expect(bill.balance.cents, 20000000);
      final estimate = await owner.api.request(
        'POST',
        '/invoices',
        body: {
          'kind': 'estimate',
          'customer_id': profile.id,
          'vehicle_id': car.id,
          'tax_rate': 0,
          'line_items': [
            {'description': 'MVP smeta', 'unit_price': 50000, 'quantity': 1},
          ],
        },
      );
      await owner.api.request('POST', '/invoices/${estimate['id']}/send');
      final conversation = await owner.api.request(
        'POST',
        '/conversations',
        body: {
          'subject': 'MVP jonli suhbat',
          'customer_id': profile.id,
          'vehicle_id': car.id,
        },
      );
      final threadId = conversation['id'] as String;
      final recorder = ui.PictureRecorder();
      ui.Canvas(recorder)
          .drawColor(const ui.Color(0xFF228866), ui.BlendMode.src);
      final picture = recorder.endRecording();
      final fixtureImage = await picture.toImage(32, 32);
      final photo = (await fixtureImage.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
      fixtureImage.dispose();
      picture.dispose();
      final photoUrl = await portal.uploadPhoto(photo, 'synthetic.png');
      await portal.send(threadId, 'MVP mijoz xabari', photos: [photoUrl]);
      await owner.sendMessage(threadId, 'MVP servis javobi');
      expect(await portal.photoBytes(photoUrl), orderedEquals(photo));
      final point = await const DeviceLocationSource().current();
      expect(point.latitude, closeTo(41.3, .02));
      final roadside = await portal.requestRoadside(
        vehicleId: car.id,
        problem: RoadsideProblem.flatTyre,
        location: point,
      );
      expect(roadside.stage, RoadsideStage.created);
      await portal.send(
        roadside.threadId!,
        'MVP yordam fotosi',
        photos: [photoUrl],
      );
      final vehicles = await portal.cars();
      final vehicle = vehicles.firstWhere((row) => row.id == car.id);
      var assigned = await owner.createWork({
        'customer_id': profile.id,
        'vehicle_id': car.id,
        'appointment_date': dateKey(today),
        'appointment_time': '09:00',
        'estimated_duration_minutes': 60,
        'customer_notes': 'MVP usta uchun ish',
      });
      assigned = await owner.changeWork(assigned.id, 'confirm');
      assigned = await owner.changeWork(assigned.id, 'assign-mechanic', {
        'mechanic_user_id': mechanicRecord['id'],
      });
      final other = await GarageSession.login(
        address,
        fixture['tenants'][1]['owner']['email'],
        password,
        onExpired: () {},
      );
      await expectLater(
        other.repository.work(work.id),
        throwsA(
          isA<AppFailure>().having((e) => e.status, 'tenant boundary', 404),
        ),
      );
      other.repository.close();

      await show(tester, entryState, WelcomeScreen(state: entryState));
      await capture(tester, 'S01', 'welcome');
      await show(
        tester,
        entryState,
        SignInScreen(state: entryState, role: Role.customer),
      );
      await capture(tester, 'S02', 'sign-in');
      await show(
        tester,
        entryState,
        ForgotPasswordScreen(source: LiveAccountSource(address: address)),
      );
      await capture(tester, 'S03', 'password-reset');
      await show(
        tester,
        customerState,
        SettingsScreen(state: customerState, onLogout: () {}),
      );
      await capture(tester, 'S04', 'settings');
      await show(
        tester,
        customerState,
        NotificationsScreen(state: customerState),
      );
      await capture(tester, 'S05', 'notification-consent');
      await show(tester, entryState, SignUpScreen(state: entryState));
      await capture(tester, 'S06', 'sign-up');
      await show(
        tester,
        customerState,
        CustomerHomeTab(portal: portal, onTab: (_) {}, onUnread: (_) {}),
      );
      expect(find.textContaining('MVP'), findsWidgets);
      await capture(tester, 'S07', 'customer-home');
      await show(tester, customerState, CarsTab(portal: portal));
      expect(find.textContaining(car.plate!), findsWidgets);
      await capture(tester, 'S08', 'cars');
      await show(
        tester,
        customerState,
        CarDetailScreen(portal: portal, vehicle: vehicle),
      );
      await capture(tester, 'S09', 'car-health');
      expect(find.text(s.healthByArea), findsOneWidget);
      await show(
        tester,
        customerState,
        PassportScreen(portal: portal, vehicle: vehicle),
      );
      expect(find.byType(QrSeal), findsOneWidget);
      await capture(tester, 'S10', 'passport');
      await show(
        tester,
        customerState,
        CustomerBookingScreen(repository: portal),
      );
      await capture(tester, 'S11', 'booking');
      await show(tester, customerState, AppointmentsScreen(portal: portal));
      await capture(tester, 'S12', 'appointments');
      await show(tester, customerState, BillingTab(portal: portal));
      expect(find.text(bill.code), findsWidgets);
      await capture(tester, 'S13', 'customer-billing');
      await show(
        tester,
        customerState,
        EstimateScreen(portal: portal, id: estimate['id']),
      );
      await capture(tester, 'S14', 'estimate');
      expect(find.text('MVP smeta'), findsWidgets);
      await portal.decideEstimate(estimate['id'], approve: true);
      expect(
        (await portal.estimate(estimate['id'])).status,
        EstimateStatus.approved,
      );
      await show(
        tester,
        customerState,
        PortalInvoiceScreen(portal: portal, id: bill.id),
      );
      await capture(tester, 'S15', 'customer-invoice');
      expect(find.text('MVP diagnostika'), findsWidgets);
      await show(tester, customerState, MessagesTab(portal: portal));
      expect(find.text('MVP jonli suhbat'), findsOneWidget);
      await capture(tester, 'S16', 'customer-messages');
      await show(
        tester,
        customerState,
        CustomerChatScreen(
          portal: portal,
          thread: threadId,
          title: 'MVP jonli suhbat',
        ),
      );
      expect(find.text('MVP servis javobi'), findsOneWidget);
      expect(find.byType(ProtectedPhoto), findsOneWidget);
      await capture(tester, 'S17', 'chat-photo');
      await show(
        tester,
        customerState,
        RoadsideScreen(portal: portal, active: roadside),
      );
      await capture(tester, 'S18', 'roadside');
      await owner.api.request(
        'PATCH',
        '/cases/${roadside.id}',
        body: {'status': 'acknowledged'},
      );
      expect(
        (await portal.roadside(roadside.id)).stage,
        RoadsideStage.acknowledged,
      );
      await show(
        tester,
        customerState,
        ProfileTab(portal: portal, state: customerState, onLogout: () {}),
      );
      expect(find.text(portal.name), findsWidgets);
      await capture(tester, 'S19', 'profile');
      await show(tester, staffState, WorkList(repository: owner));
      await capture(tester, 'S20', 'jobs');
      await show(
        tester,
        staffState,
        WorkScreen(repository: owner, work: await owner.work(work.id)),
      );
      await capture(tester, 'S21', 'job-detail');
      await show(
        tester,
        staffState,
        BookingScreen(repository: owner, customer: profile, car: car),
      );
      await capture(tester, 'S22', 'new-job');
      await show(tester, staffState, CustomerList(repository: owner));
      expect(find.text(profile.name), findsWidgets);
      await capture(tester, 'S23', 'customers');
      await show(
        tester,
        staffState,
        CustomerScreen(repository: owner, customer: profile),
      );
      await capture(tester, 'S24', 'customer-card');
      await show(tester, staffState, CustomerForm(repository: owner));
      await capture(tester, 'S25', 'new-customer');
      await show(
        tester,
        staffState,
        CarForm(repository: owner, customer: profile),
      );
      await capture(tester, 'S25', 'new-car');
      await show(tester, staffState, BillList(repository: owner));
      await capture(tester, 'S26', 'invoices');
      await show(tester, staffState, BillForm(repository: owner, work: work));
      await capture(tester, 'S27', 'invoice-editor');
      await show(
        tester,
        staffState,
        PaymentForm(repository: owner, bill: bill),
      );
      await capture(tester, 'S28', 'payment');
      bill = await owner.pay(
        bill.id,
        const Money(20000000),
        'card',
        '10000000-0000-4000-8000-${runId.substring(runId.length - 12)}',
      );
      expect((await portal.invoice(bill.id)).balance.cents, 0);
      expect(
        (await owner.bills(view: BillView.paid)).items
            .any((row) => row.id == bill.id),
        isTrue,
      );
      await show(tester, staffState, InboxTab(repository: owner));
      await capture(tester, 'S29', 'inbox');
      await show(
        tester,
        mechanicState,
        MechanicJobsTab(repository: mechanic, name: mechanicSession.name),
      );
      expect(
        (await mechanic.works()).items.every(
          (row) => row.mechanicUserId == mechanicRecord['id'],
        ),
        isTrue,
      );
      await capture(tester, 'S30', 'mechanic-jobs');
      await show(
        tester,
        mechanicState,
        MechanicJobScreen(repository: mechanic, work: assigned),
      );
      await capture(tester, 'S31', 'mechanic-detail');
      await tap(tester, find.text(s.startWork));
      expect((await mechanic.work(assigned.id)).status, WorkStatus.inProgress);
      await tap(tester, find.widgetWithText(FilledButton, s.completeWork));
      await tester.enterText(
        find.byType(TextField).last,
        'MVP native UI yakunlandi',
      );
      await tap(tester, find.widgetWithText(FilledButton, s.completeWork).last);
      expect((await owner.work(assigned.id)).status, WorkStatus.completed);
      expect(observed.length, 31);
      for (final result in observed.values) {
        result['result'] = 'passed';
      }
      await File('${evidence.path}/acceptance.json').writeAsString(
        jsonEncode({
          'run_id': runId,
          'api': address,
          'device': 'Android Emulator API 36',
          'revision': const String.fromEnvironment('BUILD_REVISION'),
          'screens': observed,
          'workflow': 'passed',
          'real_http': true,
          'demo': false,
        }),
      );
    },
  );

  testWidgets(
    'native secure session, server OTP, password change/reset and deletion',
    (tester) async {
      final state = AppState();
      final source = LiveAccountSource(address: address);
      final tag = DateTime.now().microsecondsSinceEpoch.toString();
      final phone = '99894${tag.substring(tag.length - 7)}';
      final email = 'native.auth.$tag@example.com';
      final testPassword = 'Native-local-$tag';
      await source.startSignUp(
        phone: phone,
        email: email,
        fullName: 'MVP Native Auth',
      );
      final sms = await source.api.request(
        'GET',
        '/local-test/sms',
        authenticated: false,
        query: {'phone': phone},
      );
      await source.verifySignUp(sms['code']);
      await source.completeSignUp(
        password: testPassword,
        garageId: tenant['id'],
      );
      final portal = await source.openSession(onExpired: () {});
      await state.adoptCustomer(portal);
      final restored = AppState();
      await restored.restoreSession();
      expect(restored.customerRepository?.name, 'MVP Native Auth');
      state.dispose();
      final active = restored.customerRepository as CustomerRepository;
      final tokenBeforeChallenge = active.api.accessToken;
      await expectLater(
        active.changePassword(
          'incorrect-current-password',
          '$testPassword-new',
        ),
        throwsA(
          isA<AppFailure>().having(
            (error) => error.status,
            'password challenge',
            401,
          ),
        ),
      );
      expect(active.api.accessToken, tokenBeforeChallenge);
      await active.api.request('GET', '/customer/me');
      await active.changePassword(testPassword, '$testPassword-new');
      final rotated = AppState();
      await rotated.restoreSession();
      expect(rotated.customerRepository?.name, 'MVP Native Auth');
      await rotated.logout();
      rotated.dispose();
      final reset = LiveAccountSource(address: address);
      await reset.requestReset(email);
      final resetSms = await reset.api.request(
        'GET',
        '/local-test/sms',
        authenticated: false,
        query: {'phone': phone},
      );
      await reset.confirmReset(
        identifier: email,
        code: resetSms['code'],
        password: '$testPassword-reset',
      );
      await restored.login(
        address,
        email,
        '$testPassword-reset',
        customer: true,
      );
      await show(
        tester,
        restored,
        ProfileTab(
          portal: restored.customerRepository!,
          state: restored,
          onLogout: () {
            restored.logout();
          },
        ),
      );
      final deletingPortal = restored.customerRepository as CustomerRepository;
      await expectLater(
        deletingPortal.deleteAccount(password: 'incorrect-current-password'),
        throwsA(
          isA<AppFailure>().having(
            (error) => error.status,
            'delete challenge',
            401,
          ),
        ),
      );
      await deletingPortal.api.request('GET', '/customer/me');
      await deletingPortal.deleteAccount(password: '$testPassword-reset');
      expect(deletingPortal.api.accessToken, isNull);
      await restored.logout();
      restored.dispose();
      await expectLater(
        CustomerRepository.login(
          address,
          email,
          '$testPassword-reset',
          onExpired: () {},
        ),
        throwsA(
          isA<AppFailure>().having(
            (error) => error.status,
            'deleted login',
            401,
          ),
        ),
      );
      reset.api.close();
      // Leave a real persisted synthetic account for the separate main-APK
      // force-stop/relaunch check; the fixture is never shipped in that APK.
      final finalState = AppState();
      await finalState.login(
        address,
        tenant['customer']['email'],
        password,
        customer: true,
      );
      await tester.pumpWidget(GarageApp(state: finalState));
      await settle(tester);
      await File('${evidence.path}/native-auth.json').writeAsString(
        jsonEncode({
          'secure_storage_restore': true,
          'password_rotation': true,
          'sms_reset': true,
          'account_deletion': true,
          'real_android_plugins': true,
        }),
      );
      addTearDown(finalState.dispose);
    },
  );
}
