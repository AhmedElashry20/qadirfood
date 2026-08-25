// لقطة حيّة لشاشة تتبّع الطلب — بيدخل بالعميل المميّز (0575420596) اللي محرّك
// العرض بيحافظله على طلب حيّ دايماً، يفتح التتبّع، ويفضل يرندر ~٤٥ ثانية عشان
// الكابتن يتحرّك على الخريطة. أثناء الثبات ده بناخد لقطة بـ `simctl io screenshot`.
//
// لازم: API شغّال على :3000 بـ DEMO_FLOW=1، وقاعدة البيانات مزروعة.
import 'package:customer_app/core/api_client.dart';
import 'package:customer_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('لقطة تتبّع حيّة للعميل المميّز', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(await SharedPreferences.getInstance());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(tokens)],
        child: const QadirFoodApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // تعريفية → اللغة → دخول
    if (find.text('تخطي').evaluate().isNotEmpty) {
      await tester.tap(find.text('تخطي'));
      await tester.pumpAndSettle();
    }
    if (find.text('متابعة').evaluate().isNotEmpty) {
      await tester.tap(find.text('متابعة'));
      await tester.pumpAndSettle();
    }

    // العميل المميّز — أحمد الأشرف (0575420596)
    await tester.enterText(find.byType(TextField).first, '575420596');
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال الرمز'));
    await tester.pumpAndSettle(const Duration(seconds: 5));

    // OTP — نضغط على رمز التطوير فيتعبّى
    final devHint = find.textContaining('رمز التطوير');
    expect(devHint, findsOneWidget, reason: 'السيرفر لازم يرجّع devCode');
    await tester.tap(devHint);
    await tester.pumpAndSettle();
    await tester.tap(find.text('تأكيد'));
    await tester.pumpAndSettle(const Duration(seconds: 6));

    // الرئيسية — نستنى كرت الطلب النشط يظهر (محرّك العرض بيضمن طلب حيّ)
    Finder track = find.text('تتبع');
    for (var i = 0; i < 20 && track.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(seconds: 1));
      track = find.text('تتبع');
    }
    expect(track, findsWidgets, reason: 'لازم يبقى فيه طلب نشط للعميل المميّز');

    // نفتح شاشة التتبّع
    await tester.tap(track.first);
    await tester.pumpAndSettle(const Duration(seconds: 3));
    debugPrint('>>> TRACKING_SCREEN_REACHED');

    // نفضل نرندر ~٦٠ ثانية — خلالها الكابتن بيتحرّك على الخريطة، وإحنا بناخد
    // لقطات من برّه بـ simctl. pump متكرر عشان تحديثات السوكيت تظهر (مش
    // pumpAndSettle لأن الخريطة والحركة مابتستقرّش).
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(seconds: 1));
      debugPrint('>>> HOLD $i');
    }
  });
}
