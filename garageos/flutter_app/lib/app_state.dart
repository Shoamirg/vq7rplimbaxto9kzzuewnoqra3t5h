import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'data/api_client.dart';
import 'data/demo_repository.dart';
import 'data/repository.dart';
import 'data/payment_store.dart';

class AppState extends ChangeNotifier {
  GarageRepository? repository;
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
    repository = DemoRepository();
    name = 'Demo xodim';
    garageName = 'Turon avtoservis';
    notifyListeners();
  }

  Future<void> login(String address, String email, String password) async {
    final api = ApiClient(address);
    try {
      final tokens = await api.request(
        'POST',
        '/auth/login',
        authenticated: false,
        body: {'email': email.trim(), 'password': password},
      );
      api.accessToken = tokens['access_token'];
      api.refreshToken = tokens['refresh_token'];
      final user = await api.request('GET', '/auth/me');
      final permissions = user['permissions'];
      final mechanic =
          user['role'] == 'mechanic' &&
          permissions is List &&
          permissions.contains('work.read.assigned') &&
          permissions.contains('work.write.assigned');
      if (permissions is! List ||
          (!permissions.contains('staff.read') && !mechanic)) {
        throw const AppFailure('Bu amal uchun ruxsat yoʻq.', status: 403);
      }
      name = user['full_name'];
      garageName = user['branding']?['name'] ?? 'GarageOS';
      api.onExpired = () => onExpired?.call();
      repository = LiveRepository(
        api,
        canWrite: permissions.contains('staff.write'),
        isMechanic: mechanic,
        paymentStore: mechanic
            ? null
            : DevicePaymentStore(
                Uri.encodeComponent(
                  '${api.base}/${user['id']}/${user['service_center_id']}',
                ),
              ),
      );
      notifyListeners();
    } catch (_) {
      api.close();
      rethrow;
    }
  }

  void logout() {
    repository?.close();
    repository = null;
    name = garageName = '';
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    repository?.close();
    super.dispose();
  }
}
