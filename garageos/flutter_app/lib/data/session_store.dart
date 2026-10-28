import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';

class SavedSession {
  const SavedSession(this.address, this.customer, this.access, this.refresh);
  final String address, access, refresh;
  final bool customer;
  Map<String, dynamic> toJson() => {
    'address': address,
    'customer': customer,
    'access': access,
    'refresh': refresh,
  };
  static SavedSession fromJson(Map<String, dynamic> value) => SavedSession(
    value['address'],
    value['customer'] == true,
    value['access'],
    value['refresh'],
  );
}

abstract interface class SessionStore {
  Future<SavedSession?> read();
  Future<void> write(SavedSession session);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage storage;
  static const _key = 'garageos.session.v1';
  Future<void>? _queue;

  Future<void> _serialize(Future<void> Function() operation) {
    final pending = _queue == null ? operation() : _queue!.then((_) => operation());
    _queue = pending.catchError((Object _) {});
    return pending;
  }

  @override
  Future<SavedSession?> read() async {
    if (_queue != null) await _queue;
    final value = await storage.read(key: _key);
    if (value == null) return null;
    try {
      final saved = SavedSession.fromJson(
        Map<String, dynamic>.from(jsonDecode(value)),
      );
      ApiClient.validateAddress(saved.address);
      if (saved.access.isEmpty || saved.refresh.isEmpty) {
        throw const FormatException();
      }
      return saved;
    } catch (_) {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(SavedSession session) => _serialize(
    () => storage.write(key: _key, value: jsonEncode(session.toJson())),
  );
  @override
  Future<void> clear() => _serialize(() => storage.delete(key: _key));
}
