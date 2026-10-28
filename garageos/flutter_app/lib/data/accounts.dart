import 'api_client.dart';
import 'environment.dart';
import 'customer_repository.dart';

class GarageChoice {
  const GarageChoice(this.id, this.name, this.address);
  final String id, name, address;
}

/// Customer self sign-up and password reset.
abstract interface class AccountSource {
  bool get isDemo;

  /// Step 1: sends a 6-digit SMS code to [phone].
  Future<void> startSignUp({
    required String phone,
    required String email,
    String? fullName,
  });

  /// Step 2: returns true when the phone is not yet linked to a garage and
  /// the customer has to pick one (step 4).
  Future<bool> verifySignUp(String code);
  Future<List<GarageChoice>> garages();
  Future<void> completeSignUp({required String password, String? garageId});
  Future<void> requestReset(String identifier);
  Future<void> confirmReset({
    required String identifier,
    required String code,
    required String password,
  });
}

const signUpByGarage =
    'Ilovaga kirishni servisingiz ochib beradi. Ularga qoʻngʻiroq qiling.';
const resetByGarage =
    'Parolni servisingiz tiklab beradi. Ularga qoʻngʻiroq qiling.';
const wrongCode = 'Kod notoʻgʻri. Qayta tekshiring.';

/// Server-verified signup and reset. Self-enrollment is a server capability;
/// deployments may require an existing garage customer record.
class LiveAccountSource implements AccountSource {
  LiveAccountSource({String? address, ApiClient? api})
    : api =
          api ??
          ApiClient(
            address ?? defaultApiAddress(),
            refreshPath: '/customer/auth/refresh',
          );
  final ApiClient api;
  String? _phone, _email, _code, _fullName, _garageId;
  List<GarageChoice> _garages = [];
  @override
  bool get isDemo => false;
  @override
  Future<void> startSignUp({
    required String phone,
    required String email,
    String? fullName,
  }) async {
    _phone = phone;
    _email = email.trim();
    _fullName = fullName ?? _fullName;
    _code = null;
    _garageId = null;
    _garages = [];
    await api.request(
      'POST',
      '/customer/auth/signup/start',
      authenticated: false,
      body: {'phone': phone, 'email': _email},
    );
  }

  @override
  Future<bool> verifySignUp(String code) async {
    final data = await api.request(
      'POST',
      '/customer/auth/signup/verify',
      authenticated: false,
      body: {'phone': _phone, 'email': _email, 'code': code},
    );
    _code = code;
    _garages = [
      for (final g in data['garages'])
        GarageChoice(g['id'], g['name'], g['address'] ?? ''),
    ];
    _garageId = _garages.length == 1 ? _garages.first.id : null;
    return data['needs_garage'] == true;
  }

  @override
  Future<List<GarageChoice>> garages() async => List.unmodifiable(_garages);
  @override
  Future<void> completeSignUp({
    required String password,
    String? garageId,
  }) async {
    final tokens = await api.request(
      'POST',
      '/customer/auth/signup/complete',
      authenticated: false,
      body: {
        'phone': _phone,
        'email': _email,
        'code': _code,
        'password': password,
        'service_center_id': garageId ?? _garageId,
        'full_name': _fullName,
      },
    );
    api.accessToken = tokens['access_token'];
    api.refreshToken = tokens['refresh_token'];
    _code = null;
  }

  Future<CustomerRepository> openSession({
    required void Function() onExpired,
  }) => CustomerRepository.fromApi(api, onExpired: onExpired);
  @override
  Future<void> requestReset(String identifier) async => api.request(
    'POST',
    '/customer/auth/password/reset/start',
    authenticated: false,
    body: {identifier.contains('@') ? 'email' : 'phone': identifier.trim()},
  );
  @override
  Future<void> confirmReset({
    required String identifier,
    required String code,
    required String password,
  }) async => api.request(
    'POST',
    '/customer/auth/password/reset/complete',
    authenticated: false,
    body: {
      identifier.contains('@') ? 'email' : 'phone': identifier.trim(),
      'code': code,
      'new_password': password,
    },
  );
}

/// Sample flow: any 6-digit code except 000000 is accepted. Aziz's number is
/// already linked to Turon avtoservis, other numbers pick a garage.
class DemoAccountSource implements AccountSource {
  String? _phone;
  @override
  bool get isDemo => true;
  @override
  Future<void> startSignUp({
    required String phone,
    required String email,
    String? fullName,
  }) async => _phone = phone.replaceAll(RegExp(r'\D'), '');
  @override
  Future<bool> verifySignUp(String code) async {
    if (code == '000000' || code.length != 6) throw const AppFailure(wrongCode);
    return _phone != '998901234567';
  }

  @override
  Future<List<GarageChoice>> garages() async => const [
    GarageChoice('g1', 'Turon avtoservis', 'Chilonzor, Toshkent'),
    GarageChoice('g2', 'Avto Usta Pro', 'Yunusobod, Toshkent'),
    GarageChoice('g3', 'Samarqand Motors', 'Registon koʻchasi, Samarqand'),
  ];
  @override
  Future<void> completeSignUp({
    required String password,
    String? garageId,
  }) async {
    if (password.length < 10) {
      throw const AppFailure('Kamida 10 ta belgi kiriting.');
    }
  }

  @override
  Future<void> requestReset(String identifier) async {}
  @override
  Future<void> confirmReset({
    required String identifier,
    required String code,
    required String password,
  }) async {
    if (code == '000000' || code.length != 6) throw const AppFailure(wrongCode);
    if (password.length < 10) {
      throw const AppFailure('Kamida 10 ta belgi kiriting.');
    }
  }
}
