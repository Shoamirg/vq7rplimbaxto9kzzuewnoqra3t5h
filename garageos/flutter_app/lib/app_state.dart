import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'data/accounts.dart';
import 'data/session.dart';
import 'data/customer_repository.dart';
import 'data/demo_repository.dart';
import 'data/repository.dart';
import 'data/api_client.dart';
import 'data/session_store.dart';

enum Role { customer, staff }

enum DemoRole { reception, mechanic, customer }

class AppState extends ChangeNotifier {
  AppState({SessionStore? sessionStore})
    : sessionStore = sessionStore ?? SecureSessionStore();
  final SessionStore sessionStore;
  bool restoringSession = false;

  ApiClient? get _sessionApi => customerRepository is CustomerRepository
      ? (customerRepository as CustomerRepository).api
      : repository is LiveRepository
      ? (repository as LiveRepository).api
      : null;

  Future<void> _persistSession(ApiClient api, bool customer) async {
    if (api.accessToken == null || api.refreshToken == null) return;
    await sessionStore.write(
      SavedSession(
        api.base.toString(),
        customer,
        api.accessToken!,
        api.refreshToken!,
      ),
    );
  }

  Future<void> _watchSession(ApiClient api, bool customer) async {
    final revision = _sessionRevision;
    api.onTokensChanged = () async {
      if (!_disposed && revision == _sessionRevision) {
        await _persistSession(api, customer);
      }
    };
    await _persistSession(api, customer);
  }

  Future<void> restoreSession() async {
    final revision = _sessionRevision;
    restoringSession = true;
    notifyListeners();
    ApiClient? api;
    try {
      final saved = await sessionStore.read();
      if (saved == null || _disposed || revision != _sessionRevision) return;
      api = ApiClient(
        saved.address,
        refreshPath: saved.customer
            ? '/customer/auth/refresh'
            : '/auth/refresh',
      );
      api.accessToken = saved.access;
      api.refreshToken = saved.refresh;
      // Persist rotations during restoration too, before any next API request.
      api.onTokensChanged = () => _persistSession(api!, saved.customer);
      if (saved.customer) {
        final session = await CustomerRepository.fromApi(
          api,
          onExpired: () => onExpired?.call(),
        );
        if (_disposed || revision != _sessionRevision) {
          session.close();
          return;
        }
        customerRepository = session;
        name = session.name;
        garageName = session.garageName;
      } else {
        final session = await GarageSession.fromApi(
          api,
          onExpired: () => onExpired?.call(),
        );
        if (_disposed || revision != _sessionRevision) {
          session.repository.close();
          return;
        }
        repository = session.repository;
        name = session.name;
        garageName = session.garageName;
      }
      await _watchSession(api, saved.customer);
    } on AppFailure catch (error) {
      api?.close();
      if (error.status == 401 || error.status == 403) {
        await sessionStore.clear();
      }
      if (!_disposed && revision == _sessionRevision) {
        sessionNotice = error.message;
      }
    } catch (_) {
      api?.close();
      if (!_disposed && revision == _sessionRevision) {
        repository = null;
        customerRepository = null;
        name = garageName = '';
      }
      // A device storage failure must leave the entry screen usable.
    } finally {
      if (!_disposed && revision == _sessionRevision) {
        restoringSession = false;
        notifyListeners();
      }
    }
  }

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
      demoMode ? DemoAccountSource() : LiveAccountSource();

  Future<void> adoptCustomer(CustomerRepository session) async {
    final revision = ++_sessionRevision;
    restoringSession = false;
    await _watchSession(session.api, true);
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
    demoMode = false;
    sessionNotice = null;
    notifyListeners();
  }

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
    restoringSession = false;
    _sessionRevision++;
    sessionNotice = null;
    repository?.close();
    customerRepository?.close();
    repository = null;
    customerRepository = null;
    demoMode = true;
    sessionStore.clear();
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
    restoringSession = false;
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
      await _watchSession(session.api, true);
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
    if (session.repository is LiveRepository) {
      await _watchSession((session.repository as LiveRepository).api, false);
    }
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
    restoringSession = false;
    _sessionRevision++;
    sessionStore.clear();
    repository?.close();
    customerRepository?.close();
    customerRepository = null;
    repository = null;
    name = garageName = '';
    sessionNotice = 'Kirish muddati tugadi. Qayta kiring.';
    notifyListeners();
  }

  Future<void> logout() async {
    restoringSession = false;
    final staff = repository, customer = customerRepository;
    final revision = ++_sessionRevision;
    final oldApi = _sessionApi;
    if (oldApi != null) oldApi.onTokensChanged = null;
    final clearingSession = sessionStore.clear();
    // Detach immediately; pending UI and refresh callbacks own the old client.
    repository = null;
    customerRepository = null;
    name = garageName = '';
    sessionNotice = null;
    notifyListeners();
    LogoutOutcome outcome;
    var storageFailed = false;
    try {
      await clearingSession;
    } catch (_) {
      storageFailed = true;
    }
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
    if (storageFailed) {
      sessionNotice = outcome == LogoutOutcome.confirmed
          ? 'Serverdagi sessiya bekor qilindi, lekin qurilmadagi kirish maʼlumotini tozalab boʻlmadi.'
          : 'Qurilmadagi kirish maʼlumotini tozalab boʻlmadi va serverdan chiqish tasdiqlanmadi.';
    } else if (outcome == LogoutOutcome.unconfirmed) {
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
