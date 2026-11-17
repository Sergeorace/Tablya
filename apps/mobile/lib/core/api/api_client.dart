import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Client HTTP Tablya — JWT Bearer + refresh transparent.
/// Base URL : --dart-define=API_URL=http://localhost:3001/api/v1
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'tablya_access';
  static const _refreshKey = 'tablya_refresh';
  static const _roleKey = 'tablya_role'; // 'staff' | 'client'

  late final Dio dio = Dio(BaseOptions(
    baseUrl: const String.fromEnvironment(
      'API_URL',
      defaultValue: 'http://localhost:3001/api/v1',
    ),
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Accept': 'application/json'},
  ))..interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: _tokenKey);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // 401 → tentative de refresh une fois, sinon purge.
        if (error.response?.statusCode == 401 &&
            error.requestOptions.extra['retried'] != true) {
          final ok = await refresh();
          if (ok) {
            error.requestOptions.extra['retried'] = true;
            final token = await _storage.read(key: _tokenKey);
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            try {
              final res = await dio.fetch(error.requestOptions);
              return handler.resolve(res);
            } catch (e) {
              return handler.next(error);
            }
          }
          await logout();
        }
        handler.next(error);
      },
    ));

  Future<void> saveTokens(String access, String refresh, {String? role}) async {
    await _storage.write(key: _tokenKey, value: access);
    if (refresh.isNotEmpty) {
      await _storage.write(key: _refreshKey, value: refresh);
    }
    if (role != null) await _storage.write(key: _roleKey, value: role);
  }

  Future<String?> get role async => _storage.read(key: _roleKey);

  Future<bool> get isLoggedIn async =>
      await _storage.read(key: _tokenKey) != null;

  Future<bool> refresh() async {
    final rt = await _storage.read(key: _refreshKey);
    if (rt == null) return false;
    try {
      final res = await Dio(BaseOptions(baseUrl: dio.options.baseUrl)).post(
        '/auth/refresh',
        data: {'refreshToken': rt},
      );
      await saveTokens(res.data['accessToken'], res.data['refreshToken']);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    final rt = await _storage.read(key: _refreshKey);
    if (rt != null) {
      try {
        await dio.post('/auth/logout', data: {'refreshToken': rt});
      } catch (_) {/* best-effort */}
    }
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _roleKey);
  }
}
