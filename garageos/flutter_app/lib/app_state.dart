import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'data/accounts.dart';
import 'data/session.dart';
import 'data/customer_repository.dart';
import 'data/demo_repository.dart';
import 'data/repository.dart';
import 'data/api_client.dart';

enum Role { customer, staff }

enum DemoRole { reception, mechanic, customer }

class AppState extends ChangeNotifier {
  GarageRepository? repository;
  CustomerPortal? customerRepository;
  String name = '', garageName = '';
  ThemeMode themeMode = ThemeMode.system;
  Locale locale = const Locale('uz');

  /// Pre-sign-in sample mode: account flows and sign-in use demo data.
  bool demoMode = false;

  /// Null until the person answers the notifications prompt.
  bool? notificationsAllowed;
  int _localeRevision = 0;
  bool _disposed = false;
  int _sessionRevision = 0;
  String? sessionNotice;
  Future<void> _preferenceWrites = Future.value();
  void Function()? onExpired;

  AccountSource get accounts =>
      demoMode ? DemoAccountSource() : const LiveAccountSource();

  Future<void> restoreLocale() async {
    if (_localeRevision != 0) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      final code = preferences.getString('garageos.language');
      final theme = preferences.getString('garageos.theme');
      final notify = preferences.getBool('garageos.notifications');
      if (_disposed) return;
      if (_localeRevision == 0 && ['uz', 'en', 'ru'].contains(code)) {
        locale = Locale(code!);
      }
      final mode = ThemeMode.values.where((m) => m.name == theme);
      if (mode.isNotEmpty) themeMode = mode.first;
      notificationsAllowed = notify;
      notifyListeners();
    } catch (_) {
      // Preferences are optional. Native plugin and browser storage failures
      // both keep the defaults; neither should break app startup.
    }
  }

  Future<bool> _write(Future<bool> Function(SharedPreferences) save) {
    final write = _preferenceWrites.then((_) async {
      try {
        return await save(await SharedPreferences.getInstance());
      } catch (_) {
        // Browser security/quota errors are not PlatformException. Complete
        // the queue normally so a later selection can retry saving.
        return false;
      }
    });
    _preferenceWrites = write.then((_) {});
    return write;
  }

  Future<bool> setLocale(Locale value) {
    if (!['uz', 'en', 'ru'].contains(value.languageCode)) {
      throw ArgumentError.value(value, 'locale', 'Unsupported language');
    }
    _localeRevision++;
    locale = value;
    notifyListeners();
    return _write((p) => p.setString('garageos.language', value.languageCode));
  }

  Future<bool> setThemeMode(ThemeMode value) {
    themeMode = value;
    notifyListeners();
    return _write((p) => p.setString('garageos.theme', value.name));
  }

  void toggleTheme(Brightness current) => setThemeMode(
    current == Brightness.dark ? ThemeMode.light : ThemeMode.dark,
  );

  Future<bool> setNotifications(bool allowed) {
    notificationsAllowed = allowed;
    notifyListeners();
    return _write((p) => p.setBool('garageos.notifications', allowed));
  }

  void setDemoMode(bool value) {
    demoMode = value;
    notifyListeners();
  }

  void demo([DemoRole role = DemoRole.reception]) {
    _sessionRevision++;
    sessionNotice = null;
    repository?.close();
    customerRepository?.close();
    repository = null;
    customerRepository = null;
    demoMode = true;
    switch (role) {
      case DemoRole.customer:
        final portal = DemoCustomerPortal();
        customerRepository = portal;
        name = portal.name;
        garageName = portal.garageName;
      case DemoRole.mechanic:
        repository = DemoRepository(mechanicMode: true);
        name = 'Sherzod Rahimov';
        garageName = 'Turon avtoservis';
      case DemoRole.reception:
        repository = DemoRepository();
        name = 'Demo xodim';
        garageName = 'Turon avtoservis';
    }
    notifyListeners();
  }

  Future<void> login(
    String address,
    String email,
    String password, {
    bool customer = false,
  }) async {
    if (demoMode) {
      demo(customer ? DemoRole.customer : DemoRole.reception);
      return;
    }
    final revision = ++_sessionRevision;
    if (customer) {
      final session = await CustomerRepository.login(
        address,
        email,
        password,
        onExpired: () => onExpired?.call(),
      );
      if (_disposed || revision != _sessionRevision) {
        session.close();
        return;
      }
      repository?.close();
      customerRepository?.close();
      repository = null;
      customerRepository = session;
      name = session.name;
      garageName = session.garageName;
      sessionNotice = null;
      notifyListeners();
      return;
    }
    final session = await GarageSession.login(
      address,
      email,
      password,
      onExpired: () => onExpired?.call(),
    );
    if (_disposed || revision != _sessionRevision) {
      session.repository.close();
      return;
    }
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = session.repository;
    name = session.name;
    garageName = session.garageName;
    sessionNotice = null;
    notifyListeners();
  }

  void expire() {
    _sessionRevision++;
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = null;
    name = garageName = '';
    sessionNotice = 'Kirish muddati tugadi. Qayta kiring.';
    notifyListeners();
  }

  Future<void> logout() async {
    final staff = repository, customer = customerRepository;
    final revision = ++_sessionRevision;
    // Detach immediately; pending UI and refresh callbacks own the old client.
    repository = null;
    customerRepository = null;
    name = garageName = '';
    sessionNotice = null;
    notifyListeners();
    LogoutOutcome outcome;
    try {
      outcome = customer != null
          ? await customer.logout()
          : staff != null
          ? await staff.logout()
          : LogoutOutcome.none;
    } catch (_) {
      outcome = LogoutOutcome.unconfirmed;
    } finally {
      staff?.close();
      customer?.close();
    }
    if (_disposed || revision != _sessionRevision) return;
    if (outcome == LogoutOutcome.unconfirmed) {
      sessionNotice = 'Qurilmada hisobdan chiqildi. Serverdagi sessiya bekor qilingani tasdiqlanmadi.';
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _sessionRevision++;
    _disposed = true;
    repository?.close();
    customerRepository?.close();
    super.dispose();
  }
}
