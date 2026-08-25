// ثيم تشغيلي: خطوط كبيرة، أزرار ≥56px، ألوان الحالة، breakpoints تابلت/موبايل.
// نفس هوية قادر فود (أصفر/أسود) بس بمقاسات أكبر — الشاشة دي بتتشاف من بعيد في المطبخ.
import 'package:flutter/material.dart';

/// ألوان البراند — مصدرها ملف التصميم «قادر فود — تطبيق المطعم».
abstract final class QColors {
  static const brand = Color(0xFFFFD200); // الأصفر الأساسي
  static const brandDeep = Color(0xFFE8C400);
  static const ink = Color(0xFF1C1C1C); // الأسود الأساسي
  static const inkSoft = Color(0xFF2B2B2B); // كروت فوق خلفية سودا
  static const inkLine = Color(0xFF3A3A3A); // حدود في الوضع الداكن

  static const canvas = Color(0xFFF7F6F1);
  static const surface = Color(0xFFFFFFFF);
  static const line = Color(0xFFEFEDE5);
  static const border = Color(0xFFE8E6DE);
  static const chip = Color(0xFFF4F2EA);

  static const textMuted = Color(0xFF8A8A8A);
  static const label = Color(0xFF6E6A5C);
  static const faint = Color(0xFFA9A695);
  static const hint = Color(0xFFB0B0B0);
  static const darkSub = Color(0xFF9C9C9C); // نص ثانوي فوق الأسود

  static const gold = Color(0xFFB89A00);
  static const goldDeep = Color(0xFF8A7500);
  static const goldOnBrand = Color(0xFF6E5D00);

  static const tint = Color(0xFFFFF9DE);
  static const tintStrong = Color(0xFFFFF3B8);
  static const tintSoft = Color(0xFFFFFDF2);
  static const tintBorder = Color(0xFFF2E9B8);

  static const success = Color(0xFF0BA55B);
  static const successTint = Color(0xFFE8F5EE);
  static const danger = Color(0xFFE23E3E);
  static const dangerBorder = Color(0xFFF4D7D7);

  // ── ألوان حالات الطلب (مطابقة لـ packages/shared/src/enums.ts) ──
  static const statusNew = Color(0xFFF97316); // برتقالي — طلب جديد
  static const statusPreparing = Color(0xFF3B82F6); // أزرق — قيد التحضير
  static const statusReady = Color(0xFF22C55E); // أخضر — جاهز
  static const statusOnWay = Color(0xFF8B5CF6); // بنفسجي — مع الكابتن
  static const statusDone = Color(0xFF16A34A);
  static const statusRejected = Color(0xFFEF4444);
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

  static const display =
      TextStyle(fontFamily: _c, fontSize: 26, fontWeight: FontWeight.w900, color: QColors.ink);

  static const screenTitle =
      TextStyle(fontFamily: _c, fontSize: 20, fontWeight: FontWeight.w900, color: QColors.ink);

  static const section =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w800, color: QColors.ink);

  /// عنوان كارت الطلب — أكبر من تطبيق العميل عشان القراءة من بعيد.
  static const cardTitle =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w800, color: QColors.ink);

  static const body =
      TextStyle(fontFamily: _c, fontSize: 15, fontWeight: FontWeight.w700, color: QColors.ink);

  static const bodyMuted =
      TextStyle(fontFamily: _c, fontSize: 14, fontWeight: FontWeight.w600, color: QColors.label);

  static const caption = TextStyle(
      fontFamily: _c, fontSize: 13, fontWeight: FontWeight.w600, color: QColors.textMuted);

  static const tiny = TextStyle(
      fontFamily: _c, fontSize: 12, fontWeight: FontWeight.w700, color: QColors.textMuted);

  static const fieldLabel =
      TextStyle(fontFamily: _c, fontSize: 13, fontWeight: FontWeight.w700, color: QColors.label);

  static const button =
      TextStyle(fontFamily: _c, fontSize: 17, fontWeight: FontWeight.w900, color: QColors.ink);

  /// أرقام (أسعار، أوقات، عدادات) — Outfit.
  static TextStyle num({
    double size = 15,
    FontWeight weight = FontWeight.w800,
    Color color = QColors.ink,
    TextDecoration? decoration,
  }) =>
      TextStyle(
        fontFamily: _o,
        fontSize: size,
        fontWeight: weight,
        color: color,
        decoration: decoration,
      );
}

ThemeData buildMerchantTheme() {
  const scheme = ColorScheme.light(
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
    colorScheme: scheme,
    scaffoldBackgroundColor: QColors.canvas,
    fontFamily: 'Cairo',
    appBarTheme: const AppBarTheme(
      backgroundColor: QColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: QText.screenTitle,
      iconTheme: IconThemeData(color: QColors.ink),
    ),
    dividerTheme: const DividerThemeData(color: QColors.line, thickness: 1, space: 1),
    iconTheme: const IconThemeData(color: QColors.ink),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: QColors.ink,
      selectionColor: QColors.tintStrong,
      selectionHandleColor: QColors.brandDeep,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: QColors.surface,
      hintStyle: const TextStyle(
        fontFamily: 'Cairo',
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: QColors.hint,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: const BorderSide(color: QColors.border, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: const BorderSide(color: QColors.border, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(QRadius.md),
        borderSide: const BorderSide(color: QColors.brand, width: 2),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: QColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
      ),
    ),
  );
}
