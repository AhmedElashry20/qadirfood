// لقطة لبوابة التحقق اليومي بالوجه — بيدخل بالكابتن سعد (اللي مسحنا فحصه
// النهاردة فبقى «مطلوب»)، يوصل الرئيسية فتبان بطاقة «مطلوب تحقّق يومي بالوجه»،
// وبعدين يفتح شاشة التحقق. أثناء الثبات بناخد لقطة بـ simctl.
//
// لازم: API شغّال على :3000 وقاعدة البيانات مزروعة.
import 'package:captain_app/core/api_client.dart';
import 'package:captain_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('بوابة التحقق اليومي بالوجه', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(await SharedPreferences.getInstance());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(tokens)],
        child: const CaptainApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // دخول فهد (موثّق، أوفلاين، من غير رحلة جارية → الرئيسية تبان فيها بطاقة البوابة)
    await tester.enterText(find.byType(TextField).first, '544444444');
    await tester.pumpAndSettle();
    await tester.tap(find.text('دخول'));
    await tester.pumpAndSettle(const Duration(seconds: 6));

    final devHint = find.textContaining('رمز التطوير');
    if (devHint.evaluate().isNotEmpty) {
      await tester.tap(devHint);
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }
    final confirm = find.text('تأكيد');
    if (confirm.evaluate().isNotEmpty) await tester.tap(confirm);
    await tester.pumpAndSettle(const Duration(seconds: 8));

    // الرئيسية — نستنى بطاقة البوابة تظهر (faceTodayProvider بيرجّع verifiedToday=false)
    Finder gate = find.textContaining('تحقّق يومي');
    for (var i = 0; i < 15 && gate.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(seconds: 1));
      gate = find.textContaining('تحقّق يومي');
    }
    debugPrint('>>> HOME_GATE_REACHED');
    // ثبات بوقت حقيقي (الشاشة ساكنة فالـ pump لوحده بيعدّي بسرعة) — عشان ناخد لقطة.
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 300));
      await tester.runAsync(() async => Future<void>.delayed(const Duration(seconds: 2)));
      debugPrint('>>> GATE_HOLD $i');
    }

    // نفتح شاشة التحقق
    final startBtn = find.textContaining('ابدأ التحقق');
    if (startBtn.evaluate().isNotEmpty) {
      await tester.tap(startBtn.first);
      await tester.pumpAndSettle(const Duration(seconds: 3));
    }
    debugPrint('>>> FACE_SCREEN_REACHED');
    for (var i = 0; i < 14; i++) {
      await tester.pump(const Duration(milliseconds: 300));
      await tester.runAsync(() async => Future<void>.delayed(const Duration(seconds: 2)));
      debugPrint('>>> FACE_HOLD $i');
    }
  });
}
