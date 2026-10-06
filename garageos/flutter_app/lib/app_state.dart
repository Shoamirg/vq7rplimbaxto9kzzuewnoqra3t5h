import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'data/session.dart';
import 'data/customer_repository.dart';
import 'data/demo_repository.dart';
import 'data/repository.dart';

class AppState extends ChangeNotifier {
  GarageRepository? repository;
  CustomerRepository? customerRepository;
  String name = '', garageName = '';
  ThemeMode themeMode = ThemeMode.system;
  Locale locale = const Locale('uz');
  int _localeRevision = 0;
  bool _disposed = false;
  Future<void> _preferenceWrites = Future.value();
  void Function()? onExpired;
  Future<void> restoreLocale() async {
    if (_localeRevision != 0) return;
    try {
      final preferences = await SharedPreferences.getInstance();
      final code = preferences.getString('garageos.language');
      if (!_disposed &&
          _localeRevision == 0 &&
          ['uz', 'en', 'ru'].contains(code)) {
        locale = Locale(code!);
        notifyListeners();
      }
    } catch (_) {
      // Preferences are optional. Native plugin and browser storage failures
      // both keep the default language; neither should break app startup.
    }
  }

  Future<bool> setLocale(Locale value) {
    if (!['uz', 'en', 'ru'].contains(value.languageCode)) {
      throw ArgumentError.value(value, 'locale', 'Unsupported language');
    }
    _localeRevision++;
    locale = value;
    notifyListeners();
    final write = _preferenceWrites.then((_) async {
      try {
        final preferences = await SharedPreferences.getInstance();
        return await preferences.setString(
          'garageos.language',
          value.languageCode,
        );
      } catch (_) {
        // Browser security/quota errors are not PlatformException. Complete
        // the queue normally so a later language selection can retry saving.
        return false;
      }
    });
    _preferenceWrites = write.then((_) {});
    return write;
  }

  void toggleTheme(Brightness current) {
    themeMode = current == Brightness.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  void demo() {
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = DemoRepository();
    name = 'Demo xodim';
    garageName = 'Turon avtoservis';
    notifyListeners();
  }

  Future<void> login(
    String address,
    String email,
    String password, {
    bool customer = false,
  }) async {
    if (customer) {
      final session = await CustomerRepository.login(
        address,
        email,
        password,
        onExpired: () => onExpired?.call(),
      );
      repository?.close();
      customerRepository?.close();
      repository = null;
      customerRepository = session;
      name = session.name;
      garageName = session.garageName;
      notifyListeners();
      return;
    }
    final session = await GarageSession.login(
      address,
      email,
      password,
      onExpired: () => onExpired?.call(),
    );
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = session.repository;
    name = session.name;
    garageName = session.garageName;
    notifyListeners();
  }

  void logout() {
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = null;
    name = garageName = '';
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    repository?.close();
    customerRepository?.close();
    super.dispose();
  }
}
