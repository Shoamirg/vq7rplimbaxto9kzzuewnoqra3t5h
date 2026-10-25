import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../domain/models.dart';

class AppFailure implements Exception {
  const AppFailure(
    this.message, {
    this.status = 0,
    this.uncertain = false,
    this.offline = false,
    this.unavailable = false,
  });

  /// A screen whose data source is not connected to the API yet.
  const AppFailure.unavailable()
    : this('Bu boʻlim hozircha servis orqali ishlaydi.', unavailable: true);
  final String message;
  final int status;
  final bool uncertain;

  /// The request never reached the server; cached data stays readable.
  final bool offline;
  final bool unavailable;
  @override
  String toString() => message;
}

bool isOffline(Object error) => error is AppFailure && error.offline;
bool isUnavailable(Object error) => error is AppFailure && error.unavailable;

String failureText(Object error) => error is AppFailure
    ? error.message
    : 'Maʼlumotni olishda xatolik yuz berdi. Qayta urinib koʻring.';

enum LogoutOutcome { confirmed, unconfirmed, none }

bool _reauthenticationRejected(http.Response response) {
  if (response.statusCode != 401) return false;
  try {
    final data = jsonDecode(utf8.decode(response.bodyBytes));
    return data is Map &&
        data['error'] is Map &&
        data['error']['code'] == 'CURRENT_PASSWORD_INVALID';
  } catch (_) {
    return false;
  }
}

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
  String? identityScope;
  String serviceTimeZone = 'UTC';
  String operationScope(String operation) =>
      '${identityScope ?? base}/$operation';
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
  Future<void> Function()? onTokensChanged;
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
    List<int>? fileBytes,
    String? fileName,
    bool binary = false,
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
      fileBytes: fileBytes,
      fileName: fileName,
    );
    if (generation != _generation || _closed) {
      throw _expired(uncertain: method != 'GET');
    }
    if (response.statusCode == 401 &&
        authenticated &&
        refreshToken != null &&
        !_reauthenticationRejected(response)) {
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
        fileBytes: fileBytes,
        fileName: fileName,
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
    if (response.statusCode == 401 &&
        authenticated &&
        !_reauthenticationRejected(response)) {
      _expire(generation);
    }
    if (binary && response.statusCode >= 200 && response.statusCode < 300) {
      return response.bodyBytes;
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
        'CURRENT_PASSWORD_INVALID': 'Joriy parol notoʻgʻri.',
        'INVALID_VERIFICATION_CODE': 'Kod notoʻgʻri. Qayta tekshiring.',
        'SIGNUP_PROFILE_NOT_FOUND': 'Ilovaga kirishni servisingiz ochib beradi. Ularga qoʻngʻiroq qiling.',
        'GARAGE_SELECTION_REQUIRED': 'Bu maydonni toʻldiring.',
        'ACCOUNT_ALREADY_EXISTS': 'Hisob mavjud. Kiring yoki parolni tiklang.',
        'SMS_UNAVAILABLE': 'SMS xizmati vaqtincha ishlamayapti. Keyinroq qayta urinib koʻring.',
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
    bool authenticated, {
    List<int>? fileBytes,
    String? fileName,
  }) async {
    final uri = base.replace(path: '${base.path}$path', queryParameters: query);
    final http.BaseRequest request;
    if (fileBytes != null) {
      request = http.MultipartRequest(method, uri)
        ..files.add(
          http.MultipartFile.fromBytes(
            'file',
            fileBytes,
            filename: fileName ?? 'photo.jpg',
          ),
        );
    } else {
      request = http.Request(method, uri)
        ..headers['Content-Type'] = 'application/json';
      if (body != null) (request as http.Request).body = jsonEncode(body);
    }
    request.followRedirects = !requireHttps;
    request.headers['Accept'] = 'application/json';
    if (authenticated && accessToken != null) {
      request.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (key != null) request.headers['Idempotency-Key'] = key;
    try {
      return await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw AppFailure(
        'Javob kelmadi. Ulanishni tekshirib qayta urinib koʻring.',
        uncertain: method != 'GET',
        offline: true,
      );
    } on http.ClientException {
      throw AppFailure(
        'Serverga ulanib boʻlmadi. Internet va API manzilini tekshiring.',
        uncertain: method != 'GET',
        offline: true,
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
      await onTokensChanged?.call();
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
