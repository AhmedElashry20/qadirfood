// اختبار تكامل على الجهاز مقابل الـ API الحقيقي (لازم السيرفر شغّال على :3000).
// بيدخل بالكابتن المزروع 0533333333 ويشوف رحلاته.
import 'package:captain_app/core/api_client.dart';
import 'package:captain_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('دخول الكابتن بالـ OTP الحقيقي → الرئيسية', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(await SharedPreferences.getInstance());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(tokens)],
        child: const CaptainApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('بوابة الكباتن'), findsOneWidget);

    // الكابتن المزروع — له سجل كابتن ورحلات
    await tester.enterText(find.byType(TextField).first, '533333333');
    await tester.pumpAndSettle();
    await tester.tap(find.text('دخول'));
    await tester.pumpAndSettle(const Duration(seconds: 6));

    // شاشة الرمز — السيرفر بيرجّع devCode فالتلميح لازم يبان
    expect(find.textContaining('رمز التطوير'), findsOneWidget,
        reason: 'السيرفر لازم يرجّع devCode في وضع التطوير');

    await tester.tap(find.textContaining('رمز التطوير'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // لو الشاشة ما أرسلتش تلقائياً، نضغط «تأكيد»
    final confirm = find.text('تأكيد');
    if (confirm.evaluate().isNotEmpty) {
      await tester.tap(confirm);
    }
    await tester.pumpAndSettle(const Duration(seconds: 10));

    // دخل فعلاً — التوكن اتحفظ
    expect(tokens.isLoggedIn, isTrue, reason: 'التوكن لازم يتحفظ بعد التحقق');
  });
}
