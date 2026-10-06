// وضع العرض (فاتح / داكن / حسب النظام) — محفوظ على الجهاز.
//
// `QColors.active` لازم تتظبّط **قبل** أي بناء للثيم أو للشاشات: الألوان بقت
// getters بتقرا منها، فلو اتغيّرت بعد البناء الشاشة تفضل بالألوان القديمة لحد
// أول إعادة رسم. عشان كده الـ notifier بيكتبها في `build` وفي كل تغيير.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/theme.dart';

const _prefsKey = 'theme_mode';

/// الوضع المختار. `system` = يتبع إعداد الجهاز.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    // بنبدأ بـ system وبنقرا المحفوظ بعدها: القراءة من القرص async، والـ build
    // لازم يرجّع قيمة فوراً. لو المستخدم مختار حاجة تانية، بتتحمّل في نفس الإطار
    // تقريباً فمافيش وميض.
    _load();
    return ThemeMode.system;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      final mode = switch (saved) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
      if (mode != state) state = mode;
    } catch (_) {
      // التخزين مش متاح (وضع خاص/صلاحيات) — بنكمّل بالافتراضي بدل ما التطبيق يقع.
    }
  }

  Future<void> select(ThemeMode mode) async {
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      final value = switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      };
      await prefs.setString(_prefsKey, value);
    } catch (_) {
      // الاختيار بيسري على الجلسة الحالية حتى لو الحفظ فشل.
    }
  }

  /// الاسم العربي للعرض في الإعدادات.
  static String labelOf(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'فاتح',
        ThemeMode.dark => 'داكن',
        ThemeMode.system => 'حسب النظام',
      };
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

/// بيحسب الـ palette المطلوبة ويظبّط `QColors.active` قبل البناء.
///
/// بيتنادى من `MaterialApp.builder` عشان يشتغل في كل إعادة رسم — بما فيها لما
/// المستخدم يغيّر وضع الجهاز والتطبيق شغّال.
void applyPalette(ThemeMode mode, Brightness platformBrightness) {
  final isDark = switch (mode) {
    ThemeMode.dark => true,
    ThemeMode.light => false,
    ThemeMode.system => platformBrightness == Brightness.dark,
  };
  QColors.active = isDark ? QPalette.dark : QPalette.light;
}
