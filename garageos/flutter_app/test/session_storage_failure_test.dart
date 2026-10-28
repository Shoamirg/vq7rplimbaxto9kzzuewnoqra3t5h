import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/app_state.dart';
import 'package:garageos_staff/data/api_client.dart';
import 'package:garageos_staff/data/demo_repository.dart';
import 'package:garageos_staff/data/session_store.dart';

class _BrokenClearStore implements SessionStore {
  @override
  Future<SavedSession?> read() async => null;
  @override
  Future<void> write(SavedSession session) async {}
  @override
  Future<void> clear() async =>
      throw StateError('Synthetic secure-store failure');
}

class _RevokingRepository extends DemoRepository {
  bool revoked = false;
  bool closed = false;
  @override
  Future<LogoutOutcome> logout() async {
    revoked = true;
    return LogoutOutcome.confirmed;
  }

  @override
  void close() {
    closed = true;
  }
}

void main() {
  test(
    'device storage failure must not prevent server session revocation',
    () async {
      final repository = _RevokingRepository();
      final state = AppState(sessionStore: _BrokenClearStore())
        ..repository = repository;
      addTearDown(state.dispose);
      await state.logout();
      expect(state.repository, isNull);
      expect(repository.revoked, isTrue);
      expect(repository.closed, isTrue);
      expect(state.sessionNotice, isNotNull);
    },
  );
}
