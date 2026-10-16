import 'api_client.dart';
import 'payment_store.dart';
import 'repository.dart';

/// Resolves a signed-in garage identity and its usable workflow together.
/// Screens never interpret the server's permission list or token pair.
class GarageSession {
  GarageSession._(this.repository, this.name, this.garageName);

  final GarageRepository repository;
  final String name, garageName;

  static Future<GarageSession> login(
    String address,
    String email,
    String password, {
    required void Function() onExpired,
  }) async {
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
      api.onExpired = onExpired;
      return GarageSession._(
        LiveRepository(
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
        ),
        user['full_name'],
        user['branding']?['name'] ?? 'GarageOS',
      );
    } catch (_) {
      api.close();
      rethrow;
    }
  }
}
