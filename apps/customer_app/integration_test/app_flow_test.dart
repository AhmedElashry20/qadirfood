// اختبار تكامل على الجهاز — بيشتغل على الـ API الحقيقي (لازم السيرفر شغّال على :3000
// وقاعدة البيانات مزروعة). بيدخل بالعميل 0555555555، يفتح مطعم، يضيف صنف، ويعمل طلب فعلي.
import 'package:customer_app/core/api_client.dart';
import 'package:customer_app/main.dart';
import 'package:customer_app/widgets/menu_item_tile.dart';
import 'package:customer_app/widgets/restaurant_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('رحلة عميل حقيقية على الـ API: دخول → مطعم → سلة → طلب', (tester) async {
    SharedPreferences.setMockInitialValues({}); // نبدأ مسجّلين خروج
    final tokens = TokenStore(await SharedPreferences.getInstance());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(tokens)],
        child: const QadirFoodApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // تعريفية → اللغة → تسجيل الدخول
    await tester.tap(find.text('تخطي'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('متابعة'));
    await tester.pumpAndSettle();
    expect(find.text('أهلاً بك 👋'), findsOneWidget);

    // رقم العميل المزروع في قاعدة البيانات
    await tester.enterText(find.byType(TextField).first, '555555555');
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال الرمز'));
    await tester.pumpAndSettle(const Duration(seconds: 5));

    // شاشة OTP بتعرض رمز التطوير اللي السيرفر رجّعه — نضغط عليه فيتعبّى
    expect(find.text('أدخل رمز التحقق'), findsOneWidget);
    final devHint = find.textContaining('رمز التطوير');
    expect(devHint, findsOneWidget, reason: 'السيرفر لازم يرجّع devCode في وضع التطوير');
    await tester.tap(devHint);
    await tester.pumpAndSettle();

    await tester.tap(find.text('تأكيد'));
    await tester.pumpAndSettle(const Duration(seconds: 6));

    // الرئيسية — المطاعم من قاعدة البيانات
    expect(find.text('الأقرب لك'), findsOneWidget);
    expect(find.byType(RestaurantCard), findsWidgets);

    // مطعم → صنف → إضافة للسلة
    await tester.tap(find.byType(RestaurantCard).first);
    await tester.pumpAndSettle(const Duration(seconds: 5));
    expect(find.text('وقت التوصيل'), findsOneWidget);

    await tester.tap(find.byType(MenuItemTile).first);
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // نزوّد الكمية عشان نعدّي الحد الأدنى للطلب اللي الفرع بيفرضه.
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byIcon(Icons.add).last);
      await tester.pumpAndSettle();
    }

    await tester.tap(find.text('أضف للسلة'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // السلة → إتمام الطلب
    expect(find.text('عرض السلة'), findsOneWidget);
    await tester.tap(find.text('عرض السلة'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('الإجمالي'), findsOneWidget);

    await tester.tap(find.text('متابعة الدفع ←'));
    await tester.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('المطلوب دفعه'), findsOneWidget);

    // تأكيد الطلب — POST /orders حقيقي
    await tester.tap(find.text('تأكيد الطلب'));
    await tester.pumpAndSettle(const Duration(seconds: 8));

    expect(find.text('تم استلام طلبك! 🎉'), findsOneWidget);
    expect(find.text('كود الاستلام'), findsOneWidget); // السيرفر أصدر كود استلام
  });
}
