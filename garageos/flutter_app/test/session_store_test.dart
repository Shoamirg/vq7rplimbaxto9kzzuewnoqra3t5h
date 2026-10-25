import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/data/session_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('a logout clear follows queued token rotations and cannot resurrect a session', () async {
    final store = SecureSessionStore();
    final first = store.write(
      const SavedSession(
        'https://example.com/api/v1',
        true,
        'old-access',
        'old-refresh',
      ),
    );
    final rotation = store.write(
      const SavedSession(
        'https://example.com/api/v1',
        true,
        'new-access',
        'new-refresh',
      ),
    );
    final logout = store.clear();
    await Future.wait([first, rotation, logout]);
    expect(await store.read(), isNull);
    await store.write(
      const SavedSession(
        'https://other.example/api/v1',
        false,
        'staff-access',
        'staff-refresh',
      ),
    );
    final restored = await store.read();
    expect(restored!.customer, isFalse);
    expect(restored.address, 'https://other.example/api/v1');
    expect(restored.refresh, 'staff-refresh');
  });

  test('malformed or incomplete persisted credentials are removed', () async {
    const storage = FlutterSecureStorage();
    for (final invalid in [
      'broken-json',
      '{"customer":true}',
      '{"address":"https://example.com/api/v1","access":"","refresh":"token"}',
    ]) {
      await storage.write(key: 'garageos.session.v1', value: invalid);
      expect(await SecureSessionStore(storage: storage).read(), isNull);
      expect(await storage.read(key: 'garageos.session.v1'), isNull);
    }
  });
}
