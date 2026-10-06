// الثيم — نظام تصميم قادر فود: أصفر #FFD200 / أسود #1C1C1C، خط Cairo للنص و Outfit للأرقام.
//
// ── الوضع الداكن ──
// الألوان كانت `static const`، فالوضع الداكن كان مستحيل: القيمة بتتحدّد وقت
// الترجمة. بقت getters بتقرا من palette فعّالة (`QColors.active`).
//
// **الوضع الفاتح مطابق للقديم حرفياً** — نفس أكواد الألوان، فمافيش أي تغيير
// بصري فيه. الجديد هو الـ palette الداكنة بس.
//
// نقطة مهمة في التسمية: التوكنز مسمّاة بالقيمة (`ink` = الأسود) مش بالدور،
// و`ink` كان مستخدم في مكانين متضادين — لون النص (١٤١ مرة) وخلفية داكنة مقصودة
// زي الهيدر الأسود والأفاتار (٢٧ مرة). قلبه في الداكن كان هيخلّي النص صح
// والخلفيات غلط. فاتفصل: `ink` = النص، `inkSurface` = السطح الداكن المقصود.
// في الفاتح الاتنين نفس اللون بالظبط.
import 'package:flutter/material.dart';

/// مجموعة ألوان كاملة — نسخة للفاتح ونسخة للداكن.
@immutable
class QPalette {
  const QPalette({
    required this.brand,
    required this.brandDeep,
    required this.ink,
    required this.inkSurface,
    required this.inkSoft,
    required this.canvas,
    required this.surface,
    required this.line,
    required this.border,
    required this.chip,
    required this.textMuted,
    required this.label,
    required this.faint,
    required this.hint,
    required this.navInactive,
    required this.darkSub,
    required this.gold,
    required this.goldDeep,
    required this.goldOnBrand,
    required this.tint,
    required this.tintStrong,
    required this.tintSoft,
    required this.tintBorder,
    required this.success,
    required this.danger,
    required this.dangerBorder,
  });

  final Color brand;
  final Color brandDeep;

  /// لون النص الأساسي.
  final Color ink;

  /// سطح داكن **مقصود** (هيدر أسود، أفاتار، زر غامق). مش لون نص.
  final Color inkSurface;

  /// كارت فوق سطح داكن.
  final Color inkSoft;

  final Color canvas;
  final Color surface;
  final Color line;
  final Color border;
  final Color chip;
  final Color textMuted;
  final Color label;
  final Color faint;
  final Color hint;
  final Color navInactive;

  /// نص ثانوي فوق سطح داكن.
  final Color darkSub;

  final Color gold;
  final Color goldDeep;
  final Color goldOnBrand;
  final Color tint;
  final Color tintStrong;
  final Color tintSoft;
  final Color tintBorder;
  final Color success;
  final Color danger;
  final Color dangerBorder;

  /// الوضع الفاتح — **نفس أكواد الألوان القديمة بالحرف**.
  static const light = QPalette(
    brand: Color(0xFFFFD200),
    brandDeep: Color(0xFFE8C400),
    ink: Color(0xFF1C1C1C),
    inkSurface: Color(0xFF1C1C1C),
    inkSoft: Color(0xFF2B2B2B),
    canvas: Color(0xFFF7F6F1),
    surface: Color(0xFFFFFFFF),
    line: Color(0xFFEFEDE5),
    border: Color(0xFFE8E6DE),
    chip: Color(0xFFF4F2EA),
    textMuted: Color(0xFF8A8A8A),
    label: Color(0xFF6E6A5C),
    faint: Color(0xFFA9A695),
    hint: Color(0xFFB0B0B0),
    navInactive: Color(0xFFB5B2A6),
    darkSub: Color(0xFFB8B8B8),
    gold: Color(0xFFB89A00),
    goldDeep: Color(0xFF8A7500),
    goldOnBrand: Color(0xFF6E5D00),
    tint: Color(0xFFFFF9DE),
    tintStrong: Color(0xFFFFF3B8),
    tintSoft: Color(0xFFFFFDF2),
    tintBorder: Color(0xFFF2E9B8),
    success: Color(0xFF0BA55B),
    danger: Color(0xFFE23E3E),
    dangerBorder: Color(0xFFF4D7D7),
  );

  /// الوضع الداكن.
  ///
  /// الأصفر بيفضل هو الهوية، بس بيهدى شوية: #FFD200 على خلفية سودا بيبقى
  /// ساطع لدرجة مؤذية. الأخضر والأحمر بيتفتحوا عشان يعدّوا حد التباين
  /// على خلفية داكنة — النسخة الفاتحة منهم بتبقى شبه سودا.
  static const dark = QPalette(
    brand: Color(0xFFF5C600),
    brandDeep: Color(0xFFD9AE00),
    ink: Color(0xFFF2F1EC), // النص بقى فاتح
    inkSurface: Color(0xFF242424), // السطح الداكن المقصود فضل داكن
    inkSoft: Color(0xFF2F2F2F),
    canvas: Color(0xFF141414),
    surface: Color(0xFF1E1E1E),
    line: Color(0xFF2C2C2C),
    border: Color(0xFF343434),
    chip: Color(0xFF262626),
    textMuted: Color(0xFF9A9A9A),
    label: Color(0xFFA8A49A),
    faint: Color(0xFF7C7A72),
    hint: Color(0xFF6F6F6F),
    navInactive: Color(0xFF6E6C64),
    darkSub: Color(0xFFB8B8B8),
    gold: Color(0xFFE8C74A),
    goldDeep: Color(0xFFC9A93B),
    goldOnBrand: Color(0xFF3D3400),
    tint: Color(0xFF322B0C),
    tintStrong: Color(0xFF433811),
    tintSoft: Color(0xFF231F10),
    tintBorder: Color(0xFF4A3F17),
    success: Color(0xFF3ED98A),
    danger: Color(0xFFFF7A7A),
    dangerBorder: Color(0xFF5E2B2B),
  );
}

/// ألوان البراند — مصدرها الوحيد ملف التصميم (Design Doc).
///
/// getters مش ثوابت: القيمة بتتغيّر مع الوضع. `active` بيتظبّط من
/// `ThemeModeNotifier` قبل أي رسم.
abstract final class QColors {
  /// الـ palette الفعّالة. الكتابة عليها من `ThemeModeNotifier` بس.
  static QPalette active = QPalette.light;

  static Color get brand => active.brand;
  static Color get brandDeep => active.brandDeep;
  static Color get ink => active.ink;
  static Color get inkSurface => active.inkSurface;
  static Color get inkSoft => active.inkSoft;
  static Color get canvas => active.canvas;
  static Color get surface => active.surface;
  static Color get line => active.line;
  static Color get border => active.border;
  static Color get chip => active.chip;
  static Color get textMuted => active.textMuted;
  static Color get label => active.label;
  static Color get faint => active.faint;
  static Color get hint => active.hint;
  static Color get navInactive => active.navInactive;
  static Color get darkSub => active.darkSub;
  static Color get gold => active.gold;
  static Color get goldDeep => active.goldDeep;
  static Color get goldOnBrand => active.goldOnBrand;
  static Color get tint => active.tint;
  static Color get tintStrong => active.tintStrong;
  static Color get tintSoft => active.tintSoft;
  static Color get tintBorder => active.tintBorder;
  static Color get success => active.success;
  static Color get danger => active.danger;
  static Color get dangerBorder => active.dangerBorder;
}

/// أنصاف الأقطار — مطابقة للتصميم.
abstract final class QRadius {
  static const sm = 12.0;
  static const md = 14.0;
  static const lg = 16.0;
  static const xl = 18.0;
  static const sheet = 24.0;
  static const pill = 99.0;
}

/// مسافات ثابتة.
abstract final class QSpace {
  static const screenH = 24.0; // البادنج الأفقي لكل الشاشات
  static const gap = 12.0;
  static const gapLg = 16.0;
}

/// ظل الكروت في التصميم: 0 1px 6px rgba(0,0,0,0.05)
const kCardShadow = <BoxShadow>[
  BoxShadow(color: Color(0x0D000000), blurRadius: 6, offset: Offset(0, 1)),
];

/// ظل العناصر الطافية (شيت سفلي، زر السلة).
const kFloatShadow = <BoxShadow>[
  BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8)),
];

/// أنماط النصوص. `Cairo` للنص العربي، و`Outfit` للأرقام واللاتيني.
/// أنماط النصوص — `final` مش `const` لأن ألوانها بقت getters بتتغيّر مع الوضع.
abstract final class QText {
  static const _c = 'Cairo';
  static const _o = 'Outfit';

  /// عنوان كبير داخل الشاشة (أهلاً بك، أدخل رمز التحقق…)
  static final display = TextStyle(
    fontFamily: _c,
    fontSize: 26,
    fontWeight: FontWeight.w900,
    color: QColors.ink,
    height: 1.4,
  );

  /// عنوان الهيدر
  static final screenTitle =
      TextStyle(fontFamily: _c, fontSize: 19, fontWeight: FontWeight.w900, color: QColors.ink);

  /// عنوان قسم داخل الشاشة
  static final section =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w800, color: QColors.ink);

  /// عنوان كارت (اسم مطعم / صنف)
  static final cardTitle =
      TextStyle(fontFamily: _c, fontSize: 16, fontWeight: FontWeight.w800, color: QColors.ink);

  static final body =
      TextStyle(fontFamily: _c, fontSize: 14, fontWeight: FontWeight.w700, color: QColors.ink);

  static final bodyMuted =
      TextStyle(fontFamily: _c, fontSize: 13.5, fontWeight: FontWeight.w600, color: QColors.label);

  /// سطر وصفي تحت العنوان
  static final caption = TextStyle(
    fontFamily: _c,
    fontSize: 12.5,
    fontWeight: FontWeight.w600,
    color: QColors.textMuted,
  );

  static final tiny = TextStyle(
    fontFamily: _c,
    fontSize: 11.5,
    fontWeight: FontWeight.w700,
    color: QColors.textMuted,
  );

  /// عنوان حقل إدخال
  static final fieldLabel =
      TextStyle(fontFamily: _c, fontSize: 13, fontWeight: FontWeight.w700, color: QColors.label);

  /// نص الأزرار
  static final button =
      TextStyle(fontFamily: _c, fontSize: 16, fontWeight: FontWeight.w900, color: QColors.ink);

  /// أرقام (أسعار، تقييمات، أوقات) — Outfit
  /// `color` صار nullable: القيمة الافتراضية لازم تكون ثابتة وقت الترجمة،
  /// و`QColors.ink` بقى getter. بيتحلّ لـ `QColors.ink` وقت النداء.
  static TextStyle num({
    double size = 14,
    FontWeight weight = FontWeight.w800,
    Color? color,
    TextDecoration? decoration,
  }) {
    final resolved = color ?? QColors.ink;
    return TextStyle(
      fontFamily: _o,
      fontSize: size,
      fontWeight: weight,
      color: resolved,
      decoration: decoration,
      decorationColor: resolved,
    );
  }
}

/// بيبني الثيم من الـ palette الفعّالة.
///
/// مابياخدش `const` في أي حاجة بترجع لـ `QColors`: الألوان بقت getters، فالثيم
/// لازم يتبنى بعد ما `QColors.active` تتظبّط.
ThemeData buildQadirTheme({Brightness brightness = Brightness.light}) {
  final isDark = brightness == Brightness.dark;
  final scheme = isDark
      ? ColorScheme.dark(
          primary: QColors.brand,
          onPrimary: QColors.goldOnBrand,
          secondary: QColors.ink,
          onSecondary: QColors.brand,
          surface: QColors.surface,
          onSurface: QColors.ink,
          error: QColors.danger,
        )
      : ColorScheme.light(
          primary: QColors.brand,
          onPrimary: QColors.ink,
          secondary: QColors.ink,
          onSecondary: QColors.brand,
          surface: QColors.surface,
          onSurface: QColors.ink,
          error: QColors.danger,
        );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: QColors.canvas,
    fontFamily: 'Cairo',
    appBarTheme: AppBarTheme(
      backgroundColor: QColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: QText.screenTitle,
      iconTheme: IconThemeData(color: QColors.ink),
    ),
    dividerTheme: DividerThemeData(color: QColors.line, thickness: 1, space: 1),
    iconTheme: IconThemeData(color: QColors.ink),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: QColors.ink,
      selectionColor: QColors.tintStrong,
      selectionHandleColor: QColors.brandDeep,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: QColors.surface,
      hintStyle: TextStyle(
        fontFamily: 'Cairo',
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: QColors.hint,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: BorderSide(color: QColors.border, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: BorderSide(color: QColors.border, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: BorderSide(color: QColors.brand, width: 2),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: QColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
      ),
    ),
  );
}
