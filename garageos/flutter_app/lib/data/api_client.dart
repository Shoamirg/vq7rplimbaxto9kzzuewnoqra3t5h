import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../domain/models.dart';

class AppFailure implements Exception {
  const AppFailure(this.message, {this.status = 0, this.uncertain = false});
  final String message;
  final int status;
  final bool uncertain;
  @override
  String toString() => message;
}

String failureText(Object error) => error is AppFailure
    ? error.message
    : 'Maʼlumotni olishda xatolik yuz berdi. Qayta urinib koʻring.';

enum LogoutOutcome { confirmed, unconfirmed, none }

class ApiClient {
  ApiClient(
    String address, {
    http.Client? client,
    this.refreshPath = '/auth/refresh',
    bool? requireHttps,
  }) : requireHttps = requireHttps ?? androidRelease,
       base = validateAddress(address, requireHttps: requireHttps),
       _client = client ?? http.Client();
  static bool get androidRelease =>
      kReleaseMode &&
      !kIsWeb &&
      defaultTargetPlatform == TargetPlatform.android;
  final bool requireHttps;
  final Uri base;
  final String refreshPath;
  final http.Client _client;
  String? _accessToken, _refreshToken;
  int _generation = 0;
  bool _closed = false, _invalidated = false;
  String? get accessToken => _accessToken;
  set accessToken(String? token) {
    // A deliberate login replaces identity; callbacks from the old session
    // cannot clear or reinstall credentials for the new one.
    _generation++;
    _accessToken = token;
    _refreshing = null;
    if (token != null && !_closed) _invalidated = false;
  }

  String? get refreshToken => _refreshToken;
  set refreshToken(String? token) {
    if (_refreshToken != token) {
      _generation++;
      _refreshing = null;
    }
    _refreshToken = token;
  }

  void Function()? onExpired;
  Future<void>? _refreshing;
  static Uri validateAddress(String value, {bool? requireHttps}) {
    final uri = Uri.tryParse(value.trim().replaceFirst(RegExp(r'/+$'), ''));
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        !uri.path.endsWith('/api/v1')) {
      throw const AppFailure('API manzilini /api/v1 bilan kiriting.');
    }
    if ((requireHttps ?? androidRelease) && uri.scheme != 'https') {
      throw const AppFailure('HTTPS API manzilini kiriting.');
    }
    return uri;
  }

  Future<dynamic> request(
    String method,
    String path, {
    Json? body,
    Map<String, String>? query,
    String? idempotencyKey,
    bool authenticated = true,
  }) async {
    final generation = _generation;
    if (_closed || (authenticated && _invalidated)) throw _expired();
    final usedToken = accessToken;
    var response = await _send(
      method,
      path,
      body,
      query,
      idempotencyKey,
      authenticated,
    );
    if (generation != _generation || _closed) {
      throw _expired(uncertain: method != 'GET');
    }
    if (response.statusCode == 401 && authenticated && refreshToken != null) {
      // A concurrent request might already have replaced the expired token.
      if (usedToken == accessToken) {
        final refreshing = _refreshing ??= _refresh(generation, refreshToken!);
        try {
          await refreshing;
        } finally {
          if (identical(_refreshing, refreshing)) _refreshing = null;
        }
      }
      if (generation != _generation || _closed || _invalidated) {
        throw _expired();
      }
      response = await _send(
        method,
        path,
        body,
        query,
        idempotencyKey,
        authenticated,
      );
    }
    if (generation != _generation || _closed) {
      throw _expired(uncertain: method != 'GET');
    }
    if (requireHttps &&
        response.statusCode >= 300 &&
        response.statusCode < 400) {
      throw AppFailure(
        'Server javobini oʻqib boʻlmadi.',
        status: response.statusCode,
        uncertain: method != 'GET',
      );
    }
    if (response.statusCode == 401 && authenticated) {
      _expire(generation);
    }
    dynamic data;
    try {
      data = response.body.isEmpty
          ? null
          : jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw AppFailure(
        'Server javobini oʻqib boʻlmadi.',
        status: response.statusCode,
        uncertain: method != 'GET',
      );
    }
    if (response.statusCode >= 400) {
      final code = data is Map
          ? (data['error'] is Map ? data['error']['code'] : data['code'])
          : null;
      final known = {
        'INVALID_CREDENTIALS': 'Email yoki parol notoʻgʻri.',
        'APPOINTMENT_CONFLICT':
            'Bu vaqtda usta yoki mashina band. Boshqa vaqtni tanlang.',
        'DUPLICATE_CUSTOMER_PHONE':
            'Bu telefon bilan mijoz mavjud. Qidiruvdan toping.',
        'DUPLICATE_VEHICLE': 'Bu davlat raqami yoki VIN allaqachon mavjud.',
        'INVALID_APPOINTMENT_STATE':
            'Ish holati oʻzgargan. Sahifani yangilang.',
        'PAYMENT_EXCEEDS_BALANCE':
            'Toʻlov qolgan summadan oshib ketdi. Hisobni yangilang.',
        'PAYMENT_REQUEST_MISMATCH':
            'Toʻlov tafsilotlari oʻzgargan. Hisobni tekshiring.',
        'INVALID_INVOICE_FINANCIAL_STATE':
            'Bu holatdagi hisobga toʻlov yozib boʻlmaydi.',
      };
      throw AppFailure(
        known[code] ??
            switch (response.statusCode) {
              401 => 'Kirish muddati tugadi. Qayta kiring.',
              403 => 'Bu amal uchun ruxsat yoʻq.',
              404 => 'Maʼlumot topilmadi. Roʻyxatni yangilang.',
              409 =>
                'Maʼlumot oʻzgargan yoki band. Yangilab, qayta tekshiring.',
              422 => 'Kiritilgan maʼlumotlarni tekshiring.',
              429 => 'Soʻrovlar koʻpaydi. Biroz kutib qayta urinib koʻring.',
              _ => 'Serverda xatolik yuz berdi. Qayta urinib koʻring.',
            },
        status: response.statusCode,
        uncertain: response.statusCode >= 500 && method != 'GET',
      );
    }
    return data;
  }

  Future<http.Response> _send(
    String method,
    String path,
    Json? body,
    Map<String, String>? query,
    String? key,
    bool authenticated,
  ) async {
    final uri = base.replace(path: '${base.path}$path', queryParameters: query);
    final request = http.Request(method, uri)
      ..followRedirects = !requireHttps
      ..headers['Content-Type'] = 'application/json'
      ..headers['Accept'] = 'application/json';
    if (authenticated && accessToken != null) {
      request.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (key != null) request.headers['Idempotency-Key'] = key;
    if (body != null) request.body = jsonEncode(body);
    try {
      return await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw AppFailure(
        'Javob kelmadi. Ulanishni tekshirib qayta urinib koʻring.',
        uncertain: method != 'GET',
      );
    } on http.ClientException {
      throw AppFailure(
        'Serverga ulanib boʻlmadi. Internet va API manzilini tekshiring.',
        uncertain: method != 'GET',
      );
    }
  }

  AppFailure _expired({bool uncertain = false}) => AppFailure(
    'Kirish muddati tugadi. Qayta kiring.',
    status: 401,
    uncertain: uncertain,
  );

  void _invalidate() {
    _generation++;
    _invalidated = true;
    _accessToken = _refreshToken = null;
    _refreshing = null;
  }

  void _expire(int generation) {
    if (generation != _generation || _closed || _invalidated) return;
    _invalidate();
    onExpired?.call();
  }

  Future<void> _refresh(int generation, String token) async {
    try {
      final data = await request(
        'POST',
        refreshPath,
        authenticated: false,
        body: {'refresh_token': token},
      );
      if (generation != _generation || _closed || _refreshToken != token) {
        throw _expired();
      }
      if (data is! Map ||
          data['access_token'] is! String ||
          (data['access_token'] as String).trim().isEmpty ||
          data['refresh_token'] is! String ||
          (data['refresh_token'] as String).trim().isEmpty ||
          data['refresh_token'] == token ||
          (data['token_type'] != null && data['token_type'] != 'bearer')) {
        throw _expired(uncertain: true);
      }
      _accessToken = data['access_token'];
      _refreshToken = data['refresh_token'];
    } catch (_) {
      // Rotation may already have committed when its reply is lost. Keeping
      // the old token would turn a transport retry into replay revocation.
      _expire(generation);
      throw _expired();
    }
  }

  Future<LogoutOutcome> logout() async {
    final refresh = _refreshToken, access = _accessToken;
    _invalidate(); // Hide the old identity before any server await.
    if (_closed || (refresh == null && access == null)) {
      return LogoutOutcome.none;
    }
    final path = refreshPath == '/customer/auth/refresh'
        ? '/customer/auth/logout'
        : '/auth/logout';
    final request =
        http.Request('POST', base.replace(path: '${base.path}$path'))
          ..followRedirects = false
          ..headers['Content-Type'] = 'application/json'
          ..headers['Accept'] = 'application/json';
    if (refresh != null) {
      request.body = jsonEncode({'refresh_token': refresh});
    } else {
      request.headers['Authorization'] = 'Bearer $access';
    }
    try {
      final response = await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 15));
      final data = jsonDecode(utf8.decode(response.bodyBytes));
      return response.statusCode == 200 && data is Map && data['ok'] == true
          ? LogoutOutcome.confirmed
          : LogoutOutcome.unconfirmed;
    } catch (_) {
      return LogoutOutcome.unconfirmed;
    }
  }

  void close() {
    _invalidate();
    _closed = true;
    _client.close();
  }
}
