// إعدادات البيئة — عنوان الـ API. غيّرها بـ --dart-define=API_URL=... عند البناء.
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, kReleaseMode, TargetPlatform;
import 'dart:js_interop';


/// قراءة الإعداد من JavaScript. دالة خارجية مستقلة لأن `@JS` لا تُستعمل على
/// أعضاء الأصناف الساكنة. تُرجع `null` إن لم يُحمَّل `config.js`.
@JS('qadirConfig.apiUrl')
external String? _configApiUrl();

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
    // الويب: العنوان يُقرأ وقت التشغيل من `config.js` المرفوع بجوار الصفحة.
    // هذا يسمح ببناء واحد يُضبط بعد الرفع بتعديل سطر، بدل إعادة بناء كل
    // تطبيق كلما تغيّر عنوان الخادم.
    if (kIsWeb) {
      final runtime = _runtimeApiUrl();
      if (runtime.isNotEmpty) return runtime;
      if (_override.isNotEmpty) return _override;
      // لا إعداد ولا تجاوز: نرجع لأصل الصفحة نفسه، فينفع لو كان الـ API
      // خلف البروكسي نفسه. وإن لم يكن، تظهر رسالة «تعذّر الاتصال» الواضحة.
      return Uri.base.origin;
    }

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


  /// يقرأ `window.qadirConfig.apiUrl` إن وُجد. يرجع نصاً فارغاً على غير الويب
  /// أو إن لم يكن الإعداد موجوداً — فلا يكسر شيئاً في غيابه.
  static String _runtimeApiUrl() {
    if (!kIsWeb) return '';
    try {
      final value = _configApiUrl()?.trim() ?? '';
      // نتجاهل القيمة النائبة حتى لا يحاول الاتصال بعنوان وهمي.
      if (value.isEmpty || value.contains('REPLACE_ME')) return '';
      return value.endsWith('/') ? value.substring(0, value.length - 1) : value;
    } catch (_) {
      return '';
    }
  }

  static String get api => '$apiBaseUrl/api';

  /// السوكيت بيتصل بالجذر (مافيش namespace في الـ gateway).
  static String get socket => apiBaseUrl;
}
