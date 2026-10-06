// Dio + JWT interceptor + تجديد التوكن — كل نداءات الـ API بتمر من هنا.
// التوكن بيتخزّن في SharedPreferences، وبيتجدّد تلقائياً بـ refreshToken لما يرجع 401.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'env.dart';

/// خطأ من السيرفر برسالته العربية — الشاشات بتعرض `message` مباشرة.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class TokenStore {
  const TokenStore(this._prefs);

  static const _access = 'access_token';
  static const _refresh = 'refresh_token';

  final SharedPreferences _prefs;

  String? get accessToken => _prefs.getString(_access);
  String? get refreshToken => _prefs.getString(_refresh);
  bool get isLoggedIn => accessToken != null;

  Future<void> save({required String access, required String refresh}) async {
    await _prefs.setString(_access, access);
    await _prefs.setString(_refresh, refresh);
  }

  Future<void> clear() async {
    await _prefs.remove(_access);
    await _prefs.remove(_refresh);
  }
}

class ApiClient {
  ApiClient(this.tokens) {
    dio = Dio(
      BaseOptions(
        baseUrl: Env.api,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokens.accessToken;
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          handler.next(options);
        },
        onError: (error, handler) async {
          // 401 → جرّب تجديد التوكن مرة واحدة وأعد الطلب.
          final isAuthCall = error.requestOptions.path.startsWith('/auth');
          if (error.response?.statusCode == 401 && !isAuthCall && tokens.refreshToken != null) {
            final refreshed = await _refresh();
            if (refreshed) {
              final options = error.requestOptions;
              options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
              try {
                final retry = await dio.fetch<dynamic>(options);
                return handler.resolve(retry);
              } catch (_) {
                // التكرار فشل — كمّل بالخطأ الأصلي.
              }
            } else {
              await tokens.clear();
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  final TokenStore tokens;
  late final Dio dio;

  bool _refreshing = false;

  Future<bool> _refresh() async {
    if (_refreshing) return false;
    _refreshing = true;
    try {
      final res = await Dio(BaseOptions(baseUrl: Env.api)).post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': tokens.refreshToken},
      );
      final data = res.data!;
      await tokens.save(
        access: data['accessToken'] as String,
        refresh: data['refreshToken'] as String,
      );
      return true;
    } catch (_) {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _run(() => dio.get<T>(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? body}) => _run(() => dio.post<T>(path, data: body));

  Future<T> patch<T>(String path, {Object? body}) => _run(() => dio.patch<T>(path, data: body));

  Future<T> delete<T>(String path) => _run(() => dio.delete<T>(path));

  /// بيحوّل أخطاء Dio لرسالة عربية من السيرفر (أو رسالة شبكة واضحة).
  Future<T> _run<T>(Future<Response<T>> Function() call) async {
    try {
      final res = await call();
      return res.data as T;
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = data is Map<String, dynamic> ? data['message'] : null;

      throw ApiException(
        switch (message) {
          final String m => m,
          final List<dynamic> list when list.isNotEmpty => list.first.toString(),
          // مافيش رسالة JSON من السيرفر — نفرّق بين أنواع الفشل بدل رسالة عامة.
          //
          // الحالة ٥xx بلا رسالة معناها إن الرد **مش من الـ API**: الـ API
          // بيرجّع دايماً `{ message }` عربية حتى في أخطاء ٥٠٠ (عبر
          // HttpExceptionFilter). فغيابها معناه بروكسي ردّ بدل خادم مقفول —
          // وده كان بيظهر للمستخدم كـ «خطأ غير متوقع» ويخفي السبب.
          _ => switch (e.type) {
              DioExceptionType.connectionTimeout ||
              DioExceptionType.receiveTimeout ||
              DioExceptionType.sendTimeout =>
                'الاتصال بطيء — حاول مرة أخرى',
              DioExceptionType.connectionError => 'تعذّر الاتصال بالخادم',
              _ when (e.response?.statusCode ?? 0) >= 500 =>
                'الخادم غير متاح حالياً — حاول بعد قليل',
              _ => 'حدث خطأ غير متوقع',
            },
        },
        statusCode: e.response?.statusCode,
      );
    }
  }
}

/// بيتحقن مرة واحدة في main() بعد ما SharedPreferences تجهز.
final tokenStoreProvider = Provider<TokenStore>((ref) => throw UnimplementedError());

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(tokenStoreProvider)));
