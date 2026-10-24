import 'api_client.dart';

class GarageChoice {
  const GarageChoice(this.id, this.name, this.address);
  final String id, name, address;
}

/// Customer self sign-up and password reset.
abstract interface class AccountSource {
  bool get isDemo;

  /// Step 1: sends a 6-digit SMS code to [phone].
  Future<void> startSignUp({required String phone, required String email});

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

/// The API has no self-service account endpoints yet: garages open customer
/// logins from the reception app.
class LiveAccountSource implements AccountSource {
  const LiveAccountSource();
  @override
  bool get isDemo => false;
  @override
  Future<void> startSignUp({required String phone, required String email}) =>
      throw const AppFailure(signUpByGarage);
  @override
  Future<bool> verifySignUp(String code) =>
      throw const AppFailure(signUpByGarage);
  @override
  Future<List<GarageChoice>> garages() =>
      throw const AppFailure(signUpByGarage);
  @override
  Future<void> completeSignUp({required String password, String? garageId}) =>
      throw const AppFailure(signUpByGarage);
  @override
  Future<void> requestReset(String identifier) =>
      throw const AppFailure(resetByGarage);
  @override
  Future<void> confirmReset({
    required String identifier,
    required String code,
    required String password,
  }) => throw const AppFailure(resetByGarage);
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
