import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Persists a per-request UUID so retrying after an app restart replays safely.
class PendingIdempotency {
  static const _prefix = 'garageos.pending-idempotency.';
  static final _uuid = Uuid();

  static String _storageKey(String scope, String fingerprint) {
    final stableId = _uuid.v5(Uuid.NAMESPACE_URL, 'garageos:$scope:$fingerprint');
    return '$_prefix$scope.$stableId';
  }

  static Future<String> getOrCreate(String scope, String fingerprint) async {
    final preferences = await SharedPreferences.getInstance();
    final storageKey = _storageKey(scope, fingerprint);
    final existing = preferences.getString(storageKey);
    if (existing != null && _isUuid(existing)) return existing;

    final key = _uuid.v4();
    if (!await preferences.setString(storageKey, key)) {
      throw StateError('Could not persist the request retry key');
    }
    return key;
  }

  static Future<void> clear(String scope, String fingerprint) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(_storageKey(scope, fingerprint));
    } catch (_) {
      // A committed request stays safe to replay if best-effort cleanup fails.
    }
  }

  static bool _isUuid(String value) =>
      RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', caseSensitive: false)
          .hasMatch(value);
}
