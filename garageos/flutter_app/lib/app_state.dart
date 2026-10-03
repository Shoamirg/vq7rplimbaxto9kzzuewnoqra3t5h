import 'package:flutter/material.dart';

import 'data/api_client.dart';
import 'data/demo_repository.dart';
import 'data/repository.dart';
import 'data/payment_store.dart';

class AppState extends ChangeNotifier {
  GarageRepository? repository;
  String name = '', garageName = '';
  ThemeMode themeMode = ThemeMode.system;
  void Function()? onExpired;
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
      name = user['full_name'];
      garageName = user['branding']?['name'] ?? 'GarageOS';
      api.onExpired = () => onExpired?.call();
      repository = LiveRepository(
        api,
        paymentStore: DevicePaymentStore(
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
    repository?.close();
    super.dispose();
  }
}
