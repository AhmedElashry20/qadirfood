// لغات التطبيق — الاختيار بيتحفظ محلياً وبيحدّد اتجاه الواجهة (RTL/LTR).
// النصوص نفسها لسه عربي؛ الترجمة الكاملة هتتضاف في lib/l10n لاحقاً.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// كل لغة: اسمها بلغتها، اسمها بالعربي، اسمها بالإنجليزي، العلم، وكود الـ locale.
enum AppLanguage {
  arabic('العربية', 'العربية', 'Arabic', '🇸🇦', 'ar', isRtl: true),
  english('English', 'الإنجليزية', 'English', '🇬🇧', 'en'),
  urdu('اردو', 'الأوردو', 'Urdu', '🇵🇰', 'ur', isRtl: true),
  persian('فارسی', 'الفارسية', 'Persian', '🇮🇷', 'fa', isRtl: true),
  italian('Italiano', 'الإيطالية', 'Italian', '🇮🇹', 'it'),
  german('Deutsch', 'الألمانية', 'German', '🇩🇪', 'de'),
  russian('Русский', 'الروسية', 'Russian', '🇷🇺', 'ru');

  const AppLanguage(
    this.nativeName,
    this.arabicName,
    this.englishName,
    this.flag,
    this.code, {
    this.isRtl = false,
  });

  /// الاسم بلغته («Deutsch») — ده اللي بيظهر كعنوان الكارت.
  final String nativeName;

  /// الاسم بالعربي («الألمانية») — بيظهر في الإعدادات وتحت عنوان الكارت.
  final String arabicName;

  /// الاسم بالإنجليزي — بديل السطر التاني لما العنوان يبقى عربي أصلاً.
  final String englishName;
  final String flag;

  /// كود ISO المستخدم في `Locale`.
  final String code;

  /// عربي/أوردو/فارسي = من اليمين لليسار.
  final bool isRtl;

  Locale get locale => Locale(code);

  /// السطر التاني في الكارت — مايتكررش مع العنوان (العربية → «Arabic»).
  String get subtitle => arabicName == nativeName ? englishName : arabicName;

  TextDirection get direction => isRtl ? TextDirection.rtl : TextDirection.ltr;

  /// Cairo مايغطّيش السيريلية — الروسي بيقع على خط النظام.
  String? get fontFamily => this == AppLanguage.russian ? null : 'Cairo';

  static AppLanguage fromCode(String? code) => AppLanguage.values.firstWhere(
        (l) => l.code == code,
        orElse: () => AppLanguage.arabic,
      );
}

const _prefsKey = 'app_language';

class LanguageNotifier extends Notifier<AppLanguage> {
  @override
  AppLanguage build() => ref.watch(initialLanguageProvider);

  /// بيغيّر اللغة ويحفظها — الواجهة كلها بتتبني من جديد باتجاه اللغة الجديدة.
  Future<void> select(AppLanguage language) async {
    state = language;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, language.code);
  }
}

/// اللغة المحفوظة وقت الإقلاع — بتتحقن من main() بعد ما SharedPreferences تجهز.
final initialLanguageProvider = Provider<AppLanguage>((ref) => AppLanguage.arabic);

final languageProvider = NotifierProvider<LanguageNotifier, AppLanguage>(LanguageNotifier.new);

/// بيقرأ اللغة المحفوظة قبل ما التطبيق يقلع.
AppLanguage readSavedLanguage(SharedPreferences prefs) =>
    AppLanguage.fromCode(prefs.getString(_prefsKey));
