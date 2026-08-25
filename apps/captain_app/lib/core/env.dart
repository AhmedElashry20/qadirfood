// إعدادات البيئة — عنوان الـ API. غيّرها بـ --dart-define=API_URL=... عند البناء.
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, kReleaseMode, TargetPlatform;

abstract final class Env {
  /// تجاوز صريح وقت البناء (أعلى أولوية) — مثلاً سيرفر حقيقي أو جهاز فعلي.
  static const _override = String.fromEnvironment('API_URL');

  /// iOS Simulator وmacOS بيشوفوا سيرفر الجهاز على `localhost` عادي، لكن
  /// **إيموليتر أندرويد** بيشوفه على `10.0.2.2` — فبنحوّل تلقائياً بدل ما كل
  /// مطوّر يفتكر يمرّر `--dart-define`. جهاز أندرويد حقيقي لازم IP الشبكة،
  /// وده بيتمرّر بـ `API_URL`.
  static String get apiBaseUrl {
    // نسخة الإصدار (المتجر): ممنوع منعاً باتاً نتكلم مع localhost أو HTTP عادي.
    // لازم عنوان صريح آمن يتمرّر بـ --dart-define=API_URL=https://... — ولو
    // ماتمرّرش فده خطأ بناء بنوقف عنده بوضوح بدل ما نشحن نسخة مكسورة/غير آمنة.
    if (kReleaseMode) {
      if (_override.isEmpty) {
        throw StateError(
          'API_URL مطلوب في نسخة الإصدار — ابنِ بـ --dart-define=API_URL=https://your-domain',
        );
      }
      if (!_override.startsWith('https://')) {
        throw StateError('API_URL لازم يكون HTTPS في نسخة الإصدار: $_override');
      }
      return _override;
    }
    if (_override.isNotEmpty) return _override;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  static String get api => '$apiBaseUrl/api';

  /// السوكيت بيتصل بالجذر (مافيش namespace في الـ gateway).
  static String get socket => apiBaseUrl;
}
