// شاشة اللغة — كل اللغات بتظهر، والاختيار بيغيّر اتجاه الواجهة.
import 'package:customer_app/core/locale.dart';
import 'package:customer_app/features/onboarding/language_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Widget wrap(Widget child) => ProviderScope(
        child: MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: [for (final l in AppLanguage.values) l.locale],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Directionality(textDirection: TextDirection.rtl, child: child),
        ),
      );

  testWidgets('اللغات السبعة بتظهر بأسمائها الأصلية', (tester) async {
    // شاشة طويلة عشان الـ ListView يبني كل الكروت من غير تمرير.
    tester.view.physicalSize = const Size(1200, 3600);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(wrap(const LanguageScreen()));
    await tester.pumpAndSettle();

    for (final language in AppLanguage.values) {
      expect(find.text(language.nativeName), findsOneWidget, reason: language.code);
      expect(find.text(language.subtitle), findsOneWidget, reason: language.code);
    }
  });

  testWidgets('اختيار لغة بيحرّك علامة الاختيار', (tester) async {
    tester.view.physicalSize = const Size(1200, 3600);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);

    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: [for (final l in AppLanguage.values) l.locale],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const Directionality(
            textDirection: TextDirection.rtl,
            child: LanguageScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(container.read(languageProvider), AppLanguage.arabic);

    await tester.tap(find.text('Deutsch'));
    await tester.pumpAndSettle();

    expect(container.read(languageProvider), AppLanguage.german);
  });

  test('اتجاه الواجهة بيتبع اللغة', () {
    expect(AppLanguage.arabic.direction, TextDirection.rtl);
    expect(AppLanguage.urdu.direction, TextDirection.rtl);
    expect(AppLanguage.persian.direction, TextDirection.rtl);
    expect(AppLanguage.english.direction, TextDirection.ltr);
    expect(AppLanguage.german.direction, TextDirection.ltr);
    expect(AppLanguage.russian.direction, TextDirection.ltr);
    expect(AppLanguage.italian.direction, TextDirection.ltr);
  });

  test('اللغة المختارة بتتحفظ وبترجع بعد إعادة التشغيل', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await container.read(languageProvider.notifier).select(AppLanguage.german);
    expect(container.read(languageProvider), AppLanguage.german);

    final prefs = await SharedPreferences.getInstance();
    expect(readSavedLanguage(prefs), AppLanguage.german);
  });
}
