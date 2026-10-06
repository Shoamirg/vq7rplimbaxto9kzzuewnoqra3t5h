import 'dart:async';
import 'dart:convert';

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

class ApiClient {
  ApiClient(
    String address, {
    http.Client? client,
    this.refreshPath = '/auth/refresh',
  }) : base = validateAddress(address),
       _client = client ?? http.Client();
  final Uri base;
  final String refreshPath;
  final http.Client _client;
  String? accessToken, refreshToken;
  void Function()? onExpired;
  Future<void>? _refreshing;
  static Uri validateAddress(String value) {
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
    final usedToken = accessToken;
    var response = await _send(
      method,
      path,
      body,
      query,
      idempotencyKey,
      authenticated,
    );
    if (response.statusCode == 401 && authenticated && refreshToken != null) {
      // A concurrent request might already have replaced the expired token.
      if (usedToken == accessToken) {
        _refreshing ??= _refresh();
        try {
          await _refreshing;
        } finally {
          _refreshing = null;
        }
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
    if (response.statusCode == 401 && authenticated) {
      accessToken = refreshToken = null;
      onExpired?.call();
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

  Future<void> _refresh() async {
    try {
      final data = await request(
        'POST',
        refreshPath,
        authenticated: false,
        body: {'refresh_token': refreshToken},
      );
      accessToken = data['access_token'];
      refreshToken = data['refresh_token'];
    } on AppFailure catch (e) {
      if (e.status == 401 || e.status == 403) {
        accessToken = refreshToken = null;
        onExpired?.call();
      }
      rethrow;
    }
  }

  void close() {
    accessToken = refreshToken = null;
    _client.close();
  }
}
