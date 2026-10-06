import 'api_client.dart';
import '../domain/models.dart';

/// Customer-only reads. No staff mutation surface or payment store is exposed.
class CustomerRepository {
  CustomerRepository._(this._api, this.name, this.garageName);
  final ApiClient _api;
  final String name, garageName;
  static Future<CustomerRepository> login(
    String address,
    String email,
    String password, {
    required void Function() onExpired,
  }) async {
    final api = ApiClient(address, refreshPath: '/customer/auth/refresh');
    try {
      final tokens = await api.request(
        'POST',
        '/customer/auth/login',
        authenticated: false,
        body: {'email': email.trim(), 'password': password},
      );
      api.accessToken = tokens['access_token'];
      api.refreshToken = tokens['refresh_token'];
      final profile = await api.request('GET', '/customer/me');
      api.onExpired = onExpired;
      return CustomerRepository._(
        api,
        profile['full_name'],
        profile['garage']['name'],
      );
    } catch (_) {
      api.close();
      rethrow;
    }
  }

  Future<PageData<Json>> history(
    String kind, {
    String query = '',
    int page = 1,
  }) async {
    final data = await _api.request(
      'GET',
      '/customer/history/$kind',
      query: {'q': query, 'page': '$page'},
    );
    return PageData(
      (data['items'] as List).map((e) => Json.from(e)).toList(),
      data['total'],
      data['page'],
    );
  }

  Future<Json> invoice(String id) async =>
      Json.from(await _api.request('GET', '/customer/history/invoices/$id'));
  void close() => _api.close();
}
