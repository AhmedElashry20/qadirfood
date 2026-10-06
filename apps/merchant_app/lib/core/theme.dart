// ثيم تشغيلي: خطوط كبيرة، أزرار ≥56px، ألوان الحالة، breakpoints تابلت/موبايل.
// نفس هوية قادر فود (أصفر/أسود) بس بمقاسات أكبر — الشاشة دي بتتشاف من بعيد في المطبخ.
import 'package:flutter/material.dart';

/// ألوان البراند — مصدرها ملف التصميم «قادر فود — تطبيق المطعم».
/// مجموعة ألوان كاملة — نسخة للفاتح ونسخة للداكن.
@immutable
class QPalette {
  const QPalette({
    required this.brand,
    required this.brandDeep,
    required this.ink,
    required this.inkSurface,
    required this.inkSoft,
    required this.inkLine,
    required this.canvas,
    required this.surface,
    required this.line,
    required this.border,
    required this.chip,
    required this.textMuted,
    required this.label,
    required this.faint,
    required this.hint,
    required this.darkSub,
    required this.gold,
    required this.goldDeep,
    required this.goldOnBrand,
    required this.tint,
    required this.tintStrong,
    required this.tintSoft,
    required this.tintBorder,
    required this.success,
    required this.successTint,
    required this.danger,
    required this.dangerBorder,
    required this.statusNew,
    required this.statusPreparing,
    required this.statusReady,
    required this.statusOnWay,
    required this.statusDone,
    required this.statusRejected,
  });

  final Color brand;
  final Color brandDeep;
  final Color ink;
  final Color inkSurface;
  final Color inkSoft;
  final Color inkLine;
  final Color canvas;
  final Color surface;
  final Color line;
  final Color border;
  final Color chip;
  final Color textMuted;
  final Color label;
  final Color faint;
  final Color hint;
  final Color darkSub;
  final Color gold;
  final Color goldDeep;
  final Color goldOnBrand;
  final Color tint;
  final Color tintStrong;
  final Color tintSoft;
  final Color tintBorder;
  final Color success;
  final Color successTint;
  final Color danger;
  final Color dangerBorder;
  final Color statusNew;
  final Color statusPreparing;
  final Color statusReady;
  final Color statusOnWay;
  final Color statusDone;
  final Color statusRejected;

  /// الوضع الفاتح — **نفس أكواد الألوان القديمة بالحرف**، فمافيش أي تغيير بصري.
  static const light = QPalette(
    brand: Color(0xFFFFD200),
    brandDeep: Color(0xFFE8C400),
    ink: Color(0xFF1C1C1C),
    inkSurface: Color(0xFF1C1C1C),
    inkSoft: Color(0xFF2B2B2B),
    inkLine: Color(0xFF3A3A3A),
    canvas: Color(0xFFF7F6F1),
    surface: Color(0xFFFFFFFF),
    line: Color(0xFFEFEDE5),
    border: Color(0xFFE8E6DE),
    chip: Color(0xFFF4F2EA),
    textMuted: Color(0xFF8A8A8A),
    label: Color(0xFF6E6A5C),
    faint: Color(0xFFA9A695),
    hint: Color(0xFFB0B0B0),
    darkSub: Color(0xFF9C9C9C),
    gold: Color(0xFFB89A00),
    goldDeep: Color(0xFF8A7500),
    goldOnBrand: Color(0xFF6E5D00),
    tint: Color(0xFFFFF9DE),
    tintStrong: Color(0xFFFFF3B8),
    tintSoft: Color(0xFFFFFDF2),
    tintBorder: Color(0xFFF2E9B8),
    success: Color(0xFF0BA55B),
    successTint: Color(0xFFE8F5EE),
    danger: Color(0xFFE23E3E),
    dangerBorder: Color(0xFFF4D7D7),
    statusNew: Color(0xFFF97316),
    statusPreparing: Color(0xFF3B82F6),
    statusReady: Color(0xFF22C55E),
    statusOnWay: Color(0xFF8B5CF6),
    statusDone: Color(0xFF16A34A),
    statusRejected: Color(0xFFEF4444),
  );

  /// الوضع الداكن.
  ///
  /// الأصفر بيهدى شوية: #FFD200 على خلفية سودا بيبقى ساطع لدرجة مؤذية. الأخضر
  /// والأحمر بيتفتحوا عشان يعدّوا حد التباين. التوكنز المخصّصة للأسطح الداكنة
  /// أصلاً (زي `darkSub` و`darkField`) بتفضل زي ما هي.
  static const dark = QPalette(
    brand: Color(0xFFF5C600),
    brandDeep: Color(0xFFD9AE00),
    ink: Color(0xFFF2F1EC),
    inkSurface: Color(0xFF242424),
    inkSoft: Color(0xFF2F2F2F),
    inkLine: Color(0xFF3A3A3A),
    canvas: Color(0xFF141414),
    surface: Color(0xFF1E1E1E),
    line: Color(0xFF2C2C2C),
    border: Color(0xFF343434),
    chip: Color(0xFF262626),
    textMuted: Color(0xFF9A9A9A),
    label: Color(0xFFA8A49A),
    faint: Color(0xFF7C7A72),
    hint: Color(0xFF6F6F6F),
    darkSub: Color(0xFF9C9C9C),
    gold: Color(0xFFE8C74A),
    goldDeep: Color(0xFFC9A93B),
    goldOnBrand: Color(0xFF3D3400),
    tint: Color(0xFF322B0C),
    tintStrong: Color(0xFF433811),
    tintSoft: Color(0xFF231F10),
    tintBorder: Color(0xFF4A3F17),
    success: Color(0xFF3ED98A),
    successTint: Color(0xFF15301F),
    danger: Color(0xFFFF7A7A),
    dangerBorder: Color(0xFF5E2B2B),
    statusNew: Color(0xFFFB923C),
    statusPreparing: Color(0xFF60A5FA),
    statusReady: Color(0xFF4ADE80),
    statusOnWay: Color(0xFFA78BFA),
    statusDone: Color(0xFF4ADE80),
    statusRejected: Color(0xFFF87171),
  );
}

/// ألوان البراند — مصدرها الوحيد ملف التصميم (Design Doc).
///
/// getters مش ثوابت: القيمة بتتغيّر مع الوضع. الألوان كانت `static const` فالوضع
/// الداكن كان مستحيل — القيمة بتتحدّد وقت الترجمة.
///
/// ملاحظة تسمية: التوكنز مسمّاة بالقيمة (`ink` = الأسود) مش بالدور، و`ink` كان
/// مستخدم في مكانين متضادين — لون النص وخلفية داكنة مقصودة. قلبه في الداكن كان
/// هيخلّي النص صح والخلفيات غلط، فاتفصل: `ink` = النص، `inkSurface` = السطح.
abstract final class QColors {
  /// الـ palette الفعّالة — الكتابة عليها من `ThemeModeNotifier` بس.
  static QPalette active = QPalette.light;

  static Color get brand => active.brand;
  static Color get brandDeep => active.brandDeep;
  static Color get ink => active.ink;
  static Color get inkSurface => active.inkSurface;
  static Color get inkSoft => active.inkSoft;
  static Color get inkLine => active.inkLine;
  static Color get canvas => active.canvas;
  static Color get surface => active.surface;
  static Color get line => active.line;
  static Color get border => active.border;
  static Color get chip => active.chip;
  static Color get textMuted => active.textMuted;
  static Color get label => active.label;
  static Color get faint => active.faint;
  static Color get hint => active.hint;
  static Color get darkSub => active.darkSub;
  static Color get gold => active.gold;
  static Color get goldDeep => active.goldDeep;
  static Color get goldOnBrand => active.goldOnBrand;
  static Color get tint => active.tint;
  static Color get tintStrong => active.tintStrong;
  static Color get tintSoft => active.tintSoft;
  static Color get tintBorder => active.tintBorder;
  static Color get success => active.success;
  static Color get successTint => active.successTint;
  static Color get danger => active.danger;
  static Color get dangerBorder => active.dangerBorder;
  static Color get statusNew => active.statusNew;
  static Color get statusPreparing => active.statusPreparing;
  static Color get statusReady => active.statusReady;
  static Color get statusOnWay => active.statusOnWay;
  static Color get statusDone => active.statusDone;
  static Color get statusRejected => active.statusRejected;
}

abstract final class QRadius {
  static const sm = 12.0;
  static const md = 14.0;
  static const lg = 16.0;
  static const xl = 18.0;
  static const sheet = 24.0;
  static const pill = 99.0;
}

abstract final class QSpace {
  static const screenH = 24.0;
  static const gap = 12.0;
  static const gapLg = 16.0;

  /// أقل ارتفاع لأي زر تشغيلي — الموظف بيضغط بسرعة وأحياناً بقفاز.
  static const tapTarget = 56.0;
}

/// فوق العرض ده بنعرض تخطيط التابلت (عمودين).
const kTabletBreakpoint = 720.0;

const kCardShadow = <BoxShadow>[
  BoxShadow(color: Color(0x0D000000), blurRadius: 6, offset: Offset(0, 1)),
];

const kFloatShadow = <BoxShadow>[
  BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8)),
];

/// أنماط النصوص — Cairo للعربي و Outfit للأرقام (نفس قاعدة تطبيق العميل).
abstract final class QText {
  static const _c = 'Cairo';
  static const _o = 'Outfit';

  static final display =
      TextStyle(fontFamily: _c, fontSize: 26, fontWeight: FontWeight.w900, color: QColors.ink);

  static final screenTitle =
      TextStyle(fontFamily: _c, fontSize: 20, fontWeight: FontWeight.w900, color: QColors.ink);

  static final section =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w800, color: QColors.ink);

  /// عنوان كارت الطلب — أكبر من تطبيق العميل عشان القراءة من بعيد.
  static final cardTitle =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w800, color: QColors.ink);

  static final body =
      TextStyle(fontFamily: _c, fontSize: 15, fontWeight: FontWeight.w700, color: QColors.ink);

  static final bodyMuted =
      TextStyle(fontFamily: _c, fontSize: 14, fontWeight: FontWeight.w600, color: QColors.label);

  static final caption = TextStyle(
      fontFamily: _c, fontSize: 13, fontWeight: FontWeight.w600, color: QColors.textMuted);

  static final tiny = TextStyle(
      fontFamily: _c, fontSize: 12, fontWeight: FontWeight.w700, color: QColors.textMuted);

  static final fieldLabel =
      TextStyle(fontFamily: _c, fontSize: 13, fontWeight: FontWeight.w700, color: QColors.label);

  static final button =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w900, color: QColors.ink);

  /// أرقام (أسعار، أوقات، عدادات) — Outfit.
  /// `color` صار nullable: القيمة الافتراضية لازم تكون ثابتة وقت الترجمة،
  /// و`QColors.ink` بقى getter. بيتحلّ لـ `QColors.ink` وقت النداء.
  static TextStyle num({
    double size = 15,
    FontWeight weight = FontWeight.w800,
    Color? color,
    TextDecoration? decoration,
  }) =>
      TextStyle(
        fontFamily: _o,
        fontSize: size,
        fontWeight: weight,
        color: color ?? QColors.ink,
        decoration: decoration,
      );
}

/// بيبني الثيم من الـ palette الفعّالة.
///
/// مافيش `const` في أي حاجة بترجع لـ `QColors`: الألوان بقت getters، فالثيم لازم
/// يتبنى **بعد** ما `QColors.active` تتظبّط.
ThemeData buildMerchantTheme({Brightness brightness = Brightness.light}) {
  final isDark = brightness == Brightness.dark;
  final scheme = isDark
      ? ColorScheme.dark(
    primary: QColors.brand,
    onPrimary: QColors.ink,
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
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: QColors.hint,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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
